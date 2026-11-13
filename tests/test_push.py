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
