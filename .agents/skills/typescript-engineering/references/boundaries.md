# Boundary rules

Treat these as trust boundaries:

- HTTP request bodies and query parameters
- external API responses
- environment variables
- CLI arguments
- JSON/YAML configuration
- queue/event messages
- local storage and browser persistence
- deserialized cache values
- loosely typed database results

Boundary code should validate and normalize once, then pass a trusted representation into the domain/application layer.

Errors at boundaries should contain operational context without leaking secrets or unnecessary raw payloads.
