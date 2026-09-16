/**
 * @fileoverview Unit and boundary regression tests for AcpEventDecoder.
 *
 * Validates criteria 1, 2, 3, 4, 5, and 7 of the Stage 01 Technical Specification:
 * - Malformed JSON-RPC message envelopes (non-object, null, invalid syntax, missing jsonrpc/id/method)
 * - Non-object JSON values (123, true, [], "")
 * - Response ID with malformed result or error payload
 * - Unknown ACP notification types
 * - Malformed tool update fields (missing IDs, invalid status, malformed input/output)
 * - Session-load and session-new response narrowing
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AcpEventDecoder } from '../../../src/harness/cursor/AcpEventDecoder.js';
import { narrowAcpNewSessionResult } from '../../../src/harness/cursor/types.js';

test('AcpEventDecoder (Criteria 1 & 2): rejects malformed JSON-RPC messages and non-object values', () => {
  // Non-object primitive and array values
  assert.equal(AcpEventDecoder.decode(null).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode(undefined).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode(123).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode(true).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode(false).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode([]).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('').kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('   ').kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('"string"').kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('12345').kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('true').kind, 'invalid');
  assert.equal(AcpEventDecoder.decode('[1, 2, 3]').kind, 'invalid');

  // Invalid JSON syntax string
  const invalidJson = AcpEventDecoder.decode('{ bad json');
  assert.equal(invalidJson.kind, 'invalid');
  if (invalidJson.kind === 'invalid') {
    assert.match(invalidJson.reason, /Invalid JSON syntax/i);
  }

  // Missing both id and method
  const emptyObj = AcpEventDecoder.decode({});
  assert.equal(emptyObj.kind, 'invalid');
  if (emptyObj.kind === 'invalid') {
    assert.match(emptyObj.reason, /must contain an id or a method/i);
  }

  const jsonRpcOnly = AcpEventDecoder.decode({ jsonrpc: '2.0' });
  assert.equal(jsonRpcOnly.kind, 'invalid');

  // Invalid ID types (boolean, array, object)
  assert.equal(AcpEventDecoder.decode({ id: true }).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode({ id: [1] }).kind, 'invalid');
  assert.equal(AcpEventDecoder.decode({ id: { foo: 'bar' } }).kind, 'invalid');
});

test('AcpEventDecoder (Criteria 3): validates response ID with valid and malformed result/error', () => {
  // Valid response with result
  const res1 = AcpEventDecoder.decode({ jsonrpc: '2.0', id: 42, result: { status: 'ok' } });
  assert.equal(res1.kind, 'response');
  if (res1.kind === 'response') {
    assert.equal(res1.id, 42);
    assert.deepEqual(res1.result, { status: 'ok' });
    assert.equal(res1.error, undefined);
  }

  // Valid response with error object
  const res2 = AcpEventDecoder.decode({
    jsonrpc: '2.0',
    id: 'req-99',
    error: { code: -32600, message: 'Invalid Request', data: { extra: true } }
  });
  assert.equal(res2.kind, 'response');
  if (res2.kind === 'response') {
    assert.equal(res2.id, 'req-99');
    assert.equal(res2.error?.code, -32600);
    assert.equal(res2.error?.message, 'Invalid Request');
    assert.deepEqual(res2.error?.data, { extra: true });
  }

  // Response with error object without message or with non-string message
  const res3 = AcpEventDecoder.decode({
    jsonrpc: '2.0',
    id: 'req-100',
    error: { code: -32000 }
  });
  assert.equal(res3.kind, 'response');
  if (res3.kind === 'response') {
    assert.equal(res3.error?.message, '');
  }

  // Response with ID but missing both result and error
  const missingResultAndError = AcpEventDecoder.decode({ jsonrpc: '2.0', id: 101 });
  assert.equal(missingResultAndError.kind, 'invalid');
  if (missingResultAndError.kind === 'invalid') {
    assert.match(missingResultAndError.reason, /must contain either result or error/i);
  }

  // Response with non-object error property
  const badErrorString = AcpEventDecoder.decode({ jsonrpc: '2.0', id: 102, error: 'failed' });
  assert.equal(badErrorString.kind, 'invalid');
  if (badErrorString.kind === 'invalid') {
    assert.match(badErrorString.reason, /error property must be an object/i);
  }

  const badErrorNumber = AcpEventDecoder.decode({ jsonrpc: '2.0', id: 103, error: 500 });
  assert.equal(badErrorNumber.kind, 'invalid');
});

test('AcpEventDecoder (Criteria 4): handles unknown ACP notification types gracefully', () => {
  // Completely unknown notification method
  const unknownNotif = AcpEventDecoder.decode({
    jsonrpc: '2.0',
    method: 'vendor/custom_notification',
    params: { customField: 123 }
  });
  assert.equal(unknownNotif.kind, 'notification');
  if (unknownNotif.kind === 'notification') {
    assert.equal(unknownNotif.method, 'vendor/custom_notification');
    assert.deepEqual(unknownNotif.params, { customField: 123 });
    assert.equal(unknownNotif.update, undefined);
  }

  // session/update with unknown chunk type
  const unknownChunk = AcpEventDecoder.decode({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-x',
      update: {
        sessionUpdate: 'telemetry_chunk',
        telemetryData: { v: 1 }
      }
    }
  });
  assert.equal(unknownChunk.kind, 'notification');
  if (unknownChunk.kind === 'notification') {
    assert.equal(unknownChunk.method, 'session/update');
    assert.equal(unknownChunk.update?.sessionUpdate, 'unhandled');
    if (unknownChunk.update?.sessionUpdate === 'unhandled') {
      assert.equal(unknownChunk.update.updateType, 'telemetry_chunk');
      assert.equal(unknownChunk.update.sessionId, 'sess-x');
    }
  }

  // Notification without params
  const noParamsNotif = AcpEventDecoder.decode({
    jsonrpc: '2.0',
    method: 'cursor/ping'
  });
  assert.equal(noParamsNotif.kind, 'notification');
  if (noParamsNotif.kind === 'notification') {
    assert.equal(noParamsNotif.method, 'cursor/ping');
    assert.equal(noParamsNotif.params, undefined);
  }
});

test('AcpEventDecoder (Criteria 5): validates tool update fields and flags malformed structures', () => {
  // Valid tool update
  const validResult = AcpEventDecoder.validateToolUpdate({
    toolCallId: 'call-1',
    sessionId: 'sess-1',
    status: 'completed',
    title: 'Run test',
    kind: 'execute',
    rawInput: { command: 'npm test' },
    rawOutput: { exit_code: 0 }
  });
  assert.equal(validResult.valid, true);
  assert.equal(validResult.toolCallId, 'call-1');
  assert.equal(validResult.status, 'completed');
  assert.equal(validResult.issues.length, 0);

  // Valid tool update with string/number rawInput and primitive rawOutput and nested tc
  const nestedValid = AcpEventDecoder.validateToolUpdate({
    toolCall: {
      toolCallId: 'call-nested',
      status: 'pending',
      title: 'Run nested',
      kind: 'execute',
      sessionId: 'sess-nested',
      rawInput: 'string input',
      rawOutput: true
    }
  });
  assert.equal(nestedValid.valid, true);
  assert.equal(nestedValid.toolCallId, 'call-nested');
  assert.deepEqual(nestedValid.rawInput, { raw: 'string input' });
  assert.deepEqual(nestedValid.rawOutput, { raw: true });

  const numberInputValid = AcpEventDecoder.validateToolUpdate({
    id: 'call-num',
    rawInput: 42,
    rawOutput: 0
  });
  assert.equal(numberInputValid.valid, true);
  assert.deepEqual(numberInputValid.rawInput, { raw: 42 });
  assert.deepEqual(numberInputValid.rawOutput, { raw: 0 });

  // Missing toolCallId
  const missingId = AcpEventDecoder.validateToolUpdate({
    status: 'in_progress',
    rawInput: { command: 'ls' }
  });
  assert.equal(missingId.valid, false);
  assert.ok(missingId.issues.some((i) => i.includes('Missing tool call identifier')));

  // Invalid status string
  const invalidStatus = AcpEventDecoder.validateToolUpdate({
    toolCallId: 'call-2',
    status: 'not_a_valid_status'
  });
  assert.equal(invalidStatus.valid, false);
  assert.ok(invalidStatus.issues.some((i) => i.includes('Invalid tool status')));

  // Malformed rawInput (boolean instead of object/string/number)
  const badInput = AcpEventDecoder.validateToolUpdate({
    toolCallId: 'call-3',
    status: 'pending',
    rawInput: true
  });
  assert.equal(badInput.valid, false);
  assert.ok(badInput.issues.some((i) => i.includes('Malformed rawInput')));

  // Malformed rawOutput (function/symbol instead of primitive/object)
  const badOutput = AcpEventDecoder.validateToolUpdate({
    toolCallId: 'call-4',
    status: 'completed',
    rawOutput: () => {}
  });
  assert.equal(badOutput.valid, false);
  assert.ok(badOutput.issues.some((i) => i.includes('Malformed rawOutput')));

  // Non-object payload
  const nonObject = AcpEventDecoder.validateToolUpdate('not an object');
  assert.equal(nonObject.valid, false);
  assert.ok(nonObject.issues[0]?.includes('must be a non-null object record'));
});

test('AcpEventDecoder (Criteria 7): narrows session/load and session/new response payloads', () => {
  // Typical session/new response
  const rawSession = {
    sessionId: 'session-xyz-123',
    configOptions: [
      { id: 'thinking', options: [{ id: 'high', value: 'high' }] },
      'invalid-non-record-item'
    ],
    config_options: [{ id: 'mode', options: [{ id: 'agent', value: 'agent' }] }],
    capabilities: { loadSession: true, fs: { readTextFile: true } },
    extraServerField: 'allowed'
  };

  const narrowed = AcpEventDecoder.narrowSessionResult(rawSession);
  assert.equal(narrowed.sessionId, 'session-xyz-123');
  assert.equal(narrowed.configOptions?.length, 1);
  assert.equal(narrowed.configOptions?.[0]?.id, 'thinking');
  assert.equal(narrowed.config_options?.length, 1);
  assert.equal(narrowed.config_options?.[0]?.id, 'mode');
  assert.deepEqual(narrowed.capabilities, { loadSession: true, fs: { readTextFile: true } });
  assert.equal(narrowed.extraServerField, 'allowed');

  // Also verify export narrowAcpNewSessionResult behaves identically
  const narrowedDirect = narrowAcpNewSessionResult(rawSession);
  assert.deepEqual(narrowedDirect, narrowed);

  // Non-object input produces empty safe object
  assert.deepEqual(AcpEventDecoder.narrowSessionResult(null), {});
  assert.deepEqual(AcpEventDecoder.narrowSessionResult(undefined), {});
  assert.deepEqual(AcpEventDecoder.narrowSessionResult('invalid'), {});
  assert.deepEqual(AcpEventDecoder.narrowSessionResult([1, 2]), {});
});

test('AcpEventDecoder: decodes requests, session updates, and instance convenience methods', () => {
  const decoder = new AcpEventDecoder();

  // Interactive plan request
  const planReq = decoder.decode({
    jsonrpc: '2.0',
    id: 10,
    method: 'cursor/create_plan',
    params: { plan: 'Implement feature' }
  });
  assert.equal(planReq.kind, 'request');
  if (planReq.kind === 'request') {
    assert.equal(planReq.id, 10);
    assert.equal(planReq.method, 'cursor/create_plan');
    assert.deepEqual(planReq.params, { plan: 'Implement feature' });
  }

  // Interactive question request
  const questionReq = decoder.decode({
    jsonrpc: '2.0',
    id: 11,
    method: 'cursor/ask_question',
    params: { title: 'Choose option', questions: [] }
  });
  assert.equal(questionReq.kind, 'request');

  // Interactive permission request
  const permReq = decoder.decode({
    jsonrpc: '2.0',
    id: 12,
    method: 'session/request_permission',
    params: { toolCall: { title: 'Execute' } }
  });
  assert.equal(permReq.kind, 'request');

  // Agent message chunk update
  const agentMsg = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'agent_message_chunk',
    content: { text: 'Hello' }
  });
  assert.equal(agentMsg.sessionUpdate, 'agent_message_chunk');
  if (agentMsg.sessionUpdate === 'agent_message_chunk') {
    assert.equal(agentMsg.text, 'Hello');
  }

  // Agent thought chunk update
  const thoughtMsg = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'agent_thought_chunk',
    content: { text: 'Deep thought' }
  });
  assert.equal(thoughtMsg.sessionUpdate, 'agent_thought_chunk');
  if (thoughtMsg.sessionUpdate === 'agent_thought_chunk') {
    assert.equal(thoughtMsg.text, 'Deep thought');
  }

  // Tool call update
  const toolCall = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'tool_call',
    toolCallId: 't-123',
    title: 'Run'
  });
  assert.equal(toolCall.sessionUpdate, 'tool_call');
  if (toolCall.sessionUpdate === 'tool_call') {
    assert.equal(toolCall.toolCallId, 't-123');
  }

  // Already-decoded session update returned directly
  const alreadyDecoded = AcpEventDecoder.decodeSessionUpdate(toolCall);
  assert.equal(alreadyDecoded, toolCall);

  // Non-record update
  assert.equal(AcpEventDecoder.decodeSessionUpdate(null).sessionUpdate, 'unhandled');

  // Tool call with nested toolCall id variants
  const tc1 = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'tool_call',
    toolCall: { toolCallId: 'nested-tc-1' }
  });
  assert.equal(tc1.sessionUpdate === 'tool_call' ? tc1.toolCallId : undefined, 'nested-tc-1');

  const tc2 = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'tool_call',
    toolCall: { id: 'nested-tc-2' }
  });
  assert.equal(tc2.sessionUpdate === 'tool_call' ? tc2.toolCallId : undefined, 'nested-tc-2');

  const tc3 = AcpEventDecoder.decodeSessionUpdate({
    sessionUpdate: 'tool_call',
    id: 'raw-id-3'
  });
  assert.equal(tc3.sessionUpdate === 'tool_call' ? tc3.toolCallId : undefined, 'raw-id-3');
});
