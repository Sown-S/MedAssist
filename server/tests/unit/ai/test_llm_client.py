"""AI-05: trao đổi HTTP Ollama giả lập; không gọi model hoặc mạng bên ngoài."""

import asyncio
from copy import deepcopy
import json
import traceback

import httpx
from pydantic import ValidationError
import pytest

from app.ai.interfaces import LLMClient as LLMClientProtocol
from app.ai.llm.client import (
    LLMClient,
    LLMConfigurationError,
    LLMConnectionError,
    LLMError,
    LLMHTTPError,
    LLMInvalidJSONError,
    LLMResponseError,
    LLMTimeoutError,
)
from app.ai.llm.output_schemas import (
    ExtractionOutput,
    ReasoningOutput,
    extraction_json_schema,
    reasoning_json_schema,
)
from app.ai.llm.prompts import (
    EXTRACTION_PROMPT_VERSION,
    REASONING_PROMPT_VERSION,
    load_prompt,
)
from tests.unit.ai.fakes import MockLLMClient

MODEL = "synthetic-local-model:latest"
PROMPT = "Dữ liệu giả lập đã che định danh."
OUTPUT = {"ranking": [{"condition_code": "condition_a", "reason": "Bằng chứng giả lập."}],
          "raise_priority": False}


def response(output=OUTPUT, **envelope):
    return httpx.Response(200, json={"done": True, "response": json.dumps(output), **envelope})


def client_for(handler, **settings):
    return LLMClient(model=MODEL, transport=httpx.MockTransport(handler), **settings)


def generate(client, *, prompt=PROMPT, schema=None, timeout_seconds=1):
    return asyncio.run(client.generate_json(
        prompt=prompt,
        schema=reasoning_json_schema() if schema is None else schema,
        timeout_seconds=timeout_seconds,
    ))


def test_public_client_satisfies_protocol_and_sends_structured_local_request():
    requests = []

    def handler(request):
        requests.append(request)
        return response()

    client = client_for(handler)
    schema = reasoning_json_schema()
    original = deepcopy(schema)

    assert isinstance(client, LLMClientProtocol)
    assert client.model == MODEL
    assert requests == []  # Import/construction never runs inference.
    assert generate(client, schema=schema, timeout_seconds=1.5) == OUTPUT
    assert schema == original
    assert len(requests) == 1
    request = requests[0]
    assert str(request.url) == "http://127.0.0.1:11434/api/generate"
    assert request.method == "POST"
    assert json.loads(request.content) == {
        "model": MODEL, "prompt": PROMPT, "format": schema, "stream": False,
        "keep_alive": "5m", "options": {"temperature": 0},
    }
    assert request.extensions["timeout"] == dict(connect=1.5, read=1.5, write=1.5, pool=1.5)
    assert "authorization" not in request.headers


@pytest.mark.parametrize("keep_alive", ["10m", 0, -1])
def test_keep_alive_is_forwarded(keep_alive):
    sent = []

    def handler(request):
        sent.append(json.loads(request.content)["keep_alive"])
        return response()

    generate(client_for(handler, keep_alive=keep_alive))
    assert sent == [keep_alive]


@pytest.mark.parametrize("endpoint", [
    "http://localhost:11434", "http://127.0.0.1:11434/", "http://[::1]:11434",
    "http://ollama:11434", "http://host.docker.internal:11434",
    "http://10.1.2.3:11434", "https://172.16.1.5:11434", "http://192.168.1.2:11434",
    "http://[fd00::1]:11434",
])
def test_only_local_on_premise_origins_are_usable(endpoint):
    urls = []

    def handler(request):
        urls.append(request.url)
        return response()

    assert generate(client_for(handler, base_url=endpoint)) == OUTPUT
    assert urls == [httpx.URL(endpoint).copy_with(path="/api/generate")]


@pytest.mark.parametrize("endpoint", [
    "https://ollama.com", "https://api.openai.com", "http://8.8.8.8:11434",
    "http://[2606:4700:4700::1111]:11434", "http://ollama.example.com:11434",
    "ftp://localhost:11434", "http://localhost:11434/api/generate",
    "http://localhost:11434?patient=synthetic", "http://localhost:11434#fragment",
    "http://user:password@localhost:11434", "http://0.0.0.0:11434", "invalid-url", None,
])
def test_external_or_malformed_endpoints_fail_before_sending(endpoint):
    with pytest.raises(LLMConfigurationError):
        client_for(lambda request: pytest.fail("Unexpected HTTP request"), base_url=endpoint)


@pytest.mark.parametrize("model", [
    "", " ", " local ", "example:cloud", "example-cloud", "example-cloud:latest", None,
])
def test_invalid_or_cloud_model_names_are_rejected(model):
    with pytest.raises(LLMConfigurationError):
        LLMClient(model=model)


@pytest.mark.parametrize("keep_alive", [True, None, 1.5, "", " "])
def test_invalid_keep_alive_is_rejected(keep_alive):
    with pytest.raises(LLMConfigurationError):
        client_for(lambda request: pytest.fail("Unexpected HTTP request"), keep_alive=keep_alive)


def test_environment_proxy_is_disabled(monkeypatch):
    original = httpx.AsyncClient
    settings = []

    def factory(**kwargs):
        settings.append(kwargs)
        return original(**kwargs)

    monkeypatch.setenv("HTTP_PROXY", "http://external-proxy.invalid:8080")
    monkeypatch.setenv("HTTPS_PROXY", "http://external-proxy.invalid:8080")
    monkeypatch.setattr(httpx, "AsyncClient", factory)
    assert generate(client_for(lambda request: response())) == OUTPUT
    assert settings[0]["trust_env"] is False
    assert settings[0]["follow_redirects"] is False


@pytest.mark.parametrize("error_type", [
    httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout,
])
def test_io_timeouts_raise_a_typed_error_without_retry(error_type):
    requests = []

    def handler(request):
        requests.append(request)
        raise error_type("synthetic private prompt", request=request)

    with pytest.raises(LLMTimeoutError) as caught:
        generate(client_for(handler))
    assert isinstance(caught.value, LLMError)
    assert len(requests) == 1
    assert "synthetic private prompt" not in str(caught.value)


def test_total_deadline_cancels_a_request_even_without_an_httpx_timeout():
    requests = []
    cancelled = []

    async def handler(request):
        requests.append(request)
        try:
            await asyncio.Future()
        finally:
            cancelled.append(True)

    async def run():
        client = client_for(handler)
        await asyncio.wait_for(client.generate_json(
            prompt=PROMPT, schema=reasoning_json_schema(), timeout_seconds=0.01,
        ), timeout=1)

    with pytest.raises(LLMTimeoutError):
        asyncio.run(run())
    assert len(requests) == 1
    assert cancelled == [True]


def test_worker_cancellation_propagates():
    async def handler(request):
        raise asyncio.CancelledError

    with pytest.raises(asyncio.CancelledError):
        generate(client_for(handler))


@pytest.mark.parametrize("timeout", [0, -1])
def test_exhausted_queue_budget_does_not_send_a_request(timeout):
    with pytest.raises(LLMTimeoutError):
        generate(client_for(lambda request: pytest.fail("Unexpected HTTP request")),
                 timeout_seconds=timeout)


@pytest.mark.parametrize("timeout", [float("nan"), float("inf"), -float("inf"), True, None, "1"])
def test_invalid_timeouts_are_typed_configuration_errors(timeout):
    with pytest.raises(LLMConfigurationError):
        generate(client_for(lambda request: pytest.fail("Unexpected HTTP request")),
                 timeout_seconds=timeout)


@pytest.mark.parametrize("error_type", [
    httpx.ConnectError, httpx.ReadError, httpx.WriteError, httpx.RemoteProtocolError,
])
def test_transport_errors_raise_connection_error_without_retry(error_type):
    requests = []

    def handler(request):
        requests.append(request)
        raise error_type("synthetic private prompt", request=request)

    with pytest.raises(LLMConnectionError) as caught:
        generate(client_for(handler))
    assert isinstance(caught.value, LLMError)
    assert len(requests) == 1
    assert "synthetic private prompt" not in str(caught.value)


@pytest.mark.parametrize("status", [301, 307, 400, 404, 429, 500, 503])
def test_http_errors_have_a_status_without_body_leaks_or_redirects(status):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(status, text="synthetic private prompt", headers={
            "location": "https://external-provider.invalid/",
        })

    with pytest.raises(LLMHTTPError) as caught:
        generate(client_for(handler))
    assert caught.value.status_code == status
    assert isinstance(caught.value, LLMError)
    assert "synthetic private prompt" not in str(caught.value)
    assert len(requests) == 1


@pytest.mark.parametrize("body", [
    b"not JSON", b"", b"[]", b"null", b'"text"', b"\xff",
    b'{"response":"{}","done":true,"done":false}',
])
def test_invalid_envelope_json_is_a_typed_error(body):
    with pytest.raises(LLMInvalidJSONError):
        generate(client_for(lambda request: httpx.Response(200, content=body)))


@pytest.mark.parametrize("envelope", [
    {}, {"done": True}, {"done": True, "response": None},
    {"done": True, "response": {}}, {"response": "{}"},
    {"done": False, "response": "{}"}, {"done": 1, "response": "{}"},
    {"done": True, "response": "{}", "error": "synthetic private prompt"},
    {"done": True, "response": "{}", "done_reason": "length"},
])
def test_incomplete_or_failed_envelopes_are_not_accepted(envelope):
    with pytest.raises(LLMResponseError):
        generate(client_for(lambda request: httpx.Response(200, json=envelope)))


@pytest.mark.parametrize("generated", [
    "", "not JSON", '{"ranking":', '{"ranking": [],}', "```json\n{}\n```",
    "[]", "null", '"text"', "1", "true", '{"value": NaN}', '{"value": Infinity}',
    '{"value": -Infinity}', '{"ranking": [], "ranking": ["other"]}',
    '{"nested": {"key": 1, "key": 2}}',
])
def test_invalid_generated_json_is_a_typed_error(generated):
    with pytest.raises(LLMInvalidJSONError):
        generate(client_for(lambda request: httpx.Response(
            200, json={"done": True, "response": generated},
        )))


@pytest.mark.parametrize("prompt", ["", " ", None, 12])
def test_invalid_prompts_do_not_send_a_request(prompt):
    with pytest.raises(LLMConfigurationError):
        generate(client_for(lambda request: pytest.fail("Unexpected HTTP request")), prompt=prompt)


@pytest.mark.parametrize("schema", [
    {}, [], {"type": "array"}, {"type": "object", "extra": {1, 2}},
    {"type": "object", "extra": float("nan")},
])
def test_invalid_schemas_do_not_send_a_request(schema):
    with pytest.raises(LLMConfigurationError):
        generate(client_for(lambda request: pytest.fail("Unexpected HTTP request")), schema=schema)


@pytest.mark.parametrize("failure", ["connection", "json", "envelope", "http"])
def test_failure_tracebacks_and_logs_do_not_include_prompt_or_response(caplog, failure):
    marker = "synthetic-sensitive-patient-marker"

    def handler(request):
        if failure == "connection":
            raise httpx.ConnectError(marker, request=request)
        if failure == "json":
            return httpx.Response(200, json={"done": True, "response": marker})
        if failure == "envelope":
            return httpx.Response(200, json={"error": marker})
        return httpx.Response(500, text=marker)

    with caplog.at_level("DEBUG"):
        with pytest.raises(LLMError) as caught:
            generate(client_for(handler), prompt=marker)
    assert marker not in str(caught.value)
    assert marker not in "".join(traceback.format_exception(caught.value))
    assert marker not in caplog.text


def test_reasoning_and_extraction_schemas_can_be_sent_and_have_strict_shapes():
    sent = []
    extraction = {"symptoms": [{"symptom_code": "signal_a", "status": "UNKNOWN"}]}

    def handler(request):
        sent.append(json.loads(request.content)["format"])
        return response(extraction)

    assert generate(client_for(handler), schema=extraction_json_schema()) == extraction
    assert sent == [extraction_json_schema()]
    assert ReasoningOutput.model_validate(OUTPUT).model_dump() == OUTPUT
    assert ExtractionOutput.model_validate(extraction).model_dump() == extraction
    for schema in (reasoning_json_schema(), extraction_json_schema()):
        assert schema["type"] == "object"
        assert schema["additionalProperties"] is False
    # Mỗi bên gọi nhận schema độc lập, kể cả các định nghĩa lồng nhau.
    schema = reasoning_json_schema()
    schema["$defs"]["RankedCondition"]["properties"].clear()
    assert "condition_code" in reasoning_json_schema()["$defs"]["RankedCondition"]["properties"]


@pytest.mark.parametrize("output", [
    {"ranking": [], "raise_priority": "false"},
    {"ranking": [], "raise_priority": False, "priority": "Emergency"},
    {"ranking": [{"condition_code": "a", "reason": "r", "evidence": ["invented"]}],
     "raise_priority": False},
    {"ranking": [{"condition_code": "a", "reason": ""}], "raise_priority": False},
    {"ranking": [{"condition_code": "a", "reason": "r"}] * 5, "raise_priority": False},
])
def test_reasoning_contract_rejects_extra_evidence_priority_or_wrong_shapes(output):
    with pytest.raises(ValidationError):
        ReasoningOutput.model_validate(output)


@pytest.mark.parametrize("output", [
    {"symptoms": [{"symptom_code": "signal_a", "status": "MAYBE"}]},
    {"symptoms": [{"symptom_code": "", "status": "PRESENT"}]},
    {"symptoms": [], "priority": "Emergency"},
])
def test_extraction_contract_rejects_wrong_shapes(output):
    with pytest.raises(ValidationError):
        ExtractionOutput.model_validate(output)


@pytest.mark.parametrize("version", [REASONING_PROMPT_VERSION, EXTRACTION_PROMPT_VERSION])
def test_static_prompts_are_versioned_utf8_resources(version):
    text = load_prompt(version)
    assert version in text
    assert "Reference Suggestion" in text
    assert "JSON" in text
    assert load_prompt(version) == text


def test_prompt_loader_cannot_load_arbitrary_files():
    with pytest.raises(LLMConfigurationError):
        load_prompt("../../../../.env")


def test_mock_satisfies_protocol_and_returns_independent_results_without_http():
    client = MockLLMClient(OUTPUT)
    assert isinstance(client, LLMClientProtocol)
    result = generate(client)
    result["ranking"].clear()
    assert generate(client) == OUTPUT
    assert client.calls[0] == {
        "prompt": PROMPT, "schema": reasoning_json_schema(), "timeout_seconds": 1,
    }


@pytest.mark.parametrize("error_type", [LLMTimeoutError, LLMConnectionError, LLMInvalidJSONError])
def test_mock_injects_typed_failures_for_future_worker_nodes(error_type):
    error = error_type("Synthetic failure")
    client = MockLLMClient(error=error)
    with pytest.raises(error_type) as caught:
        generate(client)
    assert caught.value is error
    assert len(client.calls) == 1
