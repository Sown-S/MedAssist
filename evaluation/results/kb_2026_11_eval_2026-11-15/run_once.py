"""Điều phối một lượt runner chuẩn, chỉ staging; ghi metadata, không ghi prompt/response.

Không sửa thuật toán, prompt, ngân sách thời gian hay đầu ra runner.
Relay TCP loopback chuyển nguyên byte tới endpoint Tailscale đã được cung cấp.
"""
import argparse
import datetime
import hashlib
import inspect
import json
import os
from pathlib import Path
import select
import socket
import socketserver
import subprocess
import sys
import threading
import time

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MODEL = "hf.co/aisingapore/Gemma-SEA-LION-v3-9B-IT-GGUF:Q4_K_M"
DATABASE = "medassist_kb202611_stage_20261115"
REMOTE = ("100.127.111.5", 11434)


def now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat()


def kb_hashes():
    return {
        p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted((ROOT / "knowledge").rglob("*")) if p.is_file()
    }


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        with socket.create_connection(REMOTE, timeout=10) as remote:
            sockets = [self.request, remote]
            while True:
                ready, _, _ = select.select(sockets, [], [], 180)
                if not ready:
                    return
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        return
                    target = remote if source is self.request else self.request
                    target.sendall(data)


class RelayServer(socketserver.ThreadingTCPServer):
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["RuleOnly", "Full"], required=True)
    args = parser.parse_args()
    destination = HERE / ("rule_only" if args.mode == "RuleOnly" else "rule_llm")
    ledger = HERE / ("attempt_rule_only.json" if args.mode == "RuleOnly" else "attempt_rule_llm.json")
    assert not destination.exists(), "Không ghi đè/thử lại lượt đã có kết quả"
    assert not ledger.exists(), "Đã ghi nhận lượt gọi; không được chạy lần hai"
    before = kb_hashes()
    assert before == json.loads((HERE / "knowledge_hashes_before.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "evaluation/testset/manifest_freeze.json").read_text(encoding="utf-8"))
    hashes = []
    for entry in manifest["files"]:
        raw = (ROOT / entry["path"]).read_bytes().replace(b"\r\n", b"\n")
        value = hashlib.sha256(raw).hexdigest()
        assert value == entry["sha256"]
        hashes.append(value)
    assert hashlib.sha256(":".join(hashes).encode()).hexdigest() == manifest["combined_sha256"]
    config = dotenv_values(ROOT / "server/.env")
    for key in ("DATABASE_URL", "MIGRATION_DATABASE_URL"):
        url = make_url(os.environ.get(key) or config[key]).set(
            host="127.0.0.1", port=15435, database=DATABASE
        )
        assert url.database == DATABASE and url.port == 15435
        os.environ[key] = url.render_as_string(hide_password=False)
    os.environ.update(
        LLM_PROVIDER="ollama", OLLAMA_MODEL=MODEL, OLLAMA_EXTRACTION_MODEL="",
        PYTHONDONTWRITEBYTECODE="1", PYTHONIOENCODING="utf-8",
    )
    server = RelayServer(("127.0.0.1", 0), Relay)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    os.environ["OLLAMA_BASE_URL"] = f"http://127.0.0.1:{server.server_address[1]}"
    sys.path.insert(0, str(ROOT / "server"))
    from sqlalchemy import create_engine, text
    from app.core.config import settings
    from app.ai.llm.ollama_client import OllamaClient
    from app.ai.llm.client import LLMClient
    from scripts import run_eval

    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as db:
        assert db.execute(text("SELECT current_database()")).scalar_one() == DATABASE
        active = db.execute(text("SELECT label FROM knowledge_release WHERE status='Active'")).scalars().all()
        assert active == ["KB-2026.11"], active
    engine.dispose()
    assert settings.LLM_PROVIDER == "ollama" and settings.OLLAMA_MODEL == MODEL
    destination.mkdir()
    write_json(destination / "knowledge_hashes_before.json", before)
    arguments = ["--testset", str(ROOT / "evaluation/testset"), "--mode", args.mode, "--out", str(destination)]
    record = {
        "attempts": 1, "started_at": now(), "status": "STARTED", "mode": args.mode,
        "runner": "server/scripts/run_eval.py", "arguments": arguments,
        "database": DATABASE, "database_port": 15435, "provider": settings.LLM_PROVIDER,
        "model": MODEL, "remote_ollama": "http://100.127.111.5:11434",
        "loopback_relay": settings.OLLAMA_BASE_URL, "clinical_input_cases": 82,
        "extraction_input_cases": 29, "extraction_strategy": settings.AI_EXTRACTION_STRATEGY,
        "candidates_per_phrase": settings.AI_EXTRACTION_CANDIDATES_PER_PHRASE,
        "server_version": settings.VERSION,
        "git_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "approval_scope": "User-authorized technical activation on isolated staging only; clinical review PENDING",
        "observation_only": True, "prompt_or_response_logged": False,
    }
    with ledger.open("x", encoding="utf-8") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
    traces = (destination / "llm_calls.jsonl").open("x", encoding="utf-8", buffering=1)
    progress = (destination / "progress.jsonl").open("x", encoding="utf-8", buffering=1)

    def case_context():
        frame = inspect.currentframe()
        try:
            while frame:
                if frame.f_code.co_name in {"run_clinical", "run_extraction"}:
                    case = frame.f_locals.get("case", {})
                    return {"stage": "clinical" if frame.f_code.co_name == "run_clinical" else "extraction",
                            "case_id": case.get("case_id", case.get("id"))}
                frame = frame.f_back
            return {"stage": "unknown", "case_id": None}
        finally:
            del frame

    original_generate = OllamaClient.generate

    async def observed_generate(self, **kwargs):
        start = time.monotonic()
        entry = dict(case_context(), event="ollama_http", requested_model=self.model, started_at=now())
        try:
            raw = await original_generate(self, **kwargs)
            envelope = json.loads(raw)
            entry.update({k: envelope.get(k) for k in (
                "model", "done", "done_reason", "total_duration", "load_duration",
                "prompt_eval_count", "prompt_eval_duration", "eval_count", "eval_duration"
            )})
            entry["http_completed"] = True
            return raw
        except BaseException as exc:
            entry.update(http_completed=False, error_type=type(exc).__name__)
            raise
        finally:
            entry["latency_ms"] = round((time.monotonic() - start) * 1000, 1)
            traces.write(json.dumps(entry, ensure_ascii=False) + "\n")

    original_json = LLMClient.generate_json

    async def observed_json(self, **kwargs):
        entry = dict(case_context(), event="llm_json_validation", schema=kwargs["schema"].get("title"))
        try:
            result = await original_json(self, **kwargs)
            entry["valid_json"] = True
            return result
        except BaseException as exc:
            entry.update(valid_json=False, error_type=type(exc).__name__)
            raise
        finally:
            traces.write(json.dumps(entry, ensure_ascii=False) + "\n")

    original_clinical = run_eval.evaluate_case_offline

    def observed_clinical(*positional, **kwargs):
        context = case_context()
        progress.write(json.dumps(dict(context, event="start", time=now())) + "\n")
        result = original_clinical(*positional, **kwargs)
        progress.write(json.dumps(dict(context, event="end", time=now(), ai_status=result.get("ai_status"), mode=result.get("mode"))) + "\n")
        return result

    original_extraction = run_eval.dispatch_extraction

    async def observed_extraction(*positional, **kwargs):
        context = case_context()
        progress.write(json.dumps(dict(context, event="start", time=now())) + "\n")
        result = await original_extraction(*positional, **kwargs)
        progress.write(json.dumps(dict(context, event="end", time=now(), completed=result.completed, failure_code=result.failure_code)) + "\n")
        return result

    OllamaClient.generate = observed_generate
    LLMClient.generate_json = observed_json
    run_eval.evaluate_case_offline = observed_clinical
    run_eval.dispatch_extraction = observed_extraction
    started = time.monotonic()
    try:
        code = run_eval.main(arguments)
        record.update(status="FINISHED" if code == 0 else "FAILED", exit_code=code)
    except BaseException as exc:
        record.update(status="FAILED", error_type=type(exc).__name__)
        raise
    finally:
        record.update(finished_at=now(), wall_ms=round((time.monotonic() - started) * 1000, 1))
        after = kb_hashes()
        record["knowledge_hashes_equal"] = before == after
        write_json(destination / "knowledge_hashes_after.json", after)
        write_json(ledger, record)
        traces.close()
        progress.close()
        server.shutdown()
        server.server_close()
    assert before == after
    return code


if __name__ == "__main__":
    raise SystemExit(main())
