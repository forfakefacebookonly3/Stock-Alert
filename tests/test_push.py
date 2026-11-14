import sys

from checker import push

SUB = {"endpoint": "https://secret.example/endpoint-xyz", "keys": {"p256dh": "p", "auth": "a"}}
PAYLOAD = {"title": "NVDA แตะ SL 178.00 (ล่าสุด 177.60)", "body": "b", "url": "/#/s/NVDA"}


def test_dry_run_opt_in_returns_ok_and_prints_title_only(monkeypatch, capsys):
    monkeypatch.setenv("DRY_RUN", "1")
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    assert push.send(SUB, PAYLOAD) == "ok"
    out = capsys.readouterr().out
    assert PAYLOAD["title"] in out
    assert "secret.example" not in out
    assert "pywebpush" not in sys.modules


def test_missing_key_without_dry_run_is_error(monkeypatch, capsys):
    monkeypatch.delenv("DRY_RUN", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    assert push.send(SUB, PAYLOAD) == "error"
    out = capsys.readouterr().out
    assert "ไม่ได้ตั้ง VAPID_PRIVATE_KEY" in out
    assert "secret.example" not in out


def test_empty_key_without_dry_run_is_error(monkeypatch):
    monkeypatch.delenv("DRY_RUN", raising=False)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "")
    assert push.send(SUB, PAYLOAD) == "error"


def test_webpush_called_with_ttl_urgency_and_timeout(monkeypatch):
    import types

    seen = {}

    def fake_webpush(**kwargs):
        seen.update(kwargs)

    fake = types.ModuleType("pywebpush")
    fake.webpush = fake_webpush
    fake.WebPushException = type("WebPushException", (Exception,), {})
    monkeypatch.setitem(sys.modules, "pywebpush", fake)
    monkeypatch.delenv("DRY_RUN", raising=False)
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "k")
    assert push.send(SUB, PAYLOAD) == "ok"
    assert seen["ttl"] == 86400
    assert seen["headers"] == {"Urgency": "high"}
    assert seen["timeout"] == 10


def test_subject_strips_path_so_py_vapid_accepts_it(monkeypatch):
    from py_vapid import _check_sub

    monkeypatch.setenv("VAPID_SUBJECT", "https://github.com/forfakefacebookonly3/Stock-Alert")
    assert push._subject() == "https://github.com"
    assert _check_sub(push._subject())


def test_subject_keeps_mailto_and_defaults(monkeypatch):
    monkeypatch.setenv("VAPID_SUBJECT", "mailto:me@example.com")
    assert push._subject() == "mailto:me@example.com"
    monkeypatch.setenv("VAPID_SUBJECT", "  ")
    assert push._subject() == "mailto:alert@example.com"
