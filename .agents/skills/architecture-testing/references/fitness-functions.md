# Architecture fitness functions

Automate architecture rules that matter.

Examples:

- domain cannot import HTTP/ORM/broker frameworks;
- module A cannot import module B private internals;
- public packages expose only declared exports;
- generated/OpenAPI schemas remain compatible;
- migrations pass forward/backward deployment tests where required;
- no unbounded circular package dependency graph;
- critical modules meet dependency/security policies.

Use lint rules, dependency graph tools, package exports, custom tests, or CI scripts. Architecture diagrams without enforcement drift.
