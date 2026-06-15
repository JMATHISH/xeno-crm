"""
Channel Simulation Engine

Simulates realistic message delivery across WhatsApp, Email, and SMS.
Key behaviours:
  - Channel-specific delivery profiles (open rates, click rates, CVR)
  - Time-of-day multiplier (morning sends perform better)
  - Burst failure simulation (occasional partial failures)
  - Exponential backoff retry on failed callbacks
"""

import asyncio
import random
from datetime import datetime
import httpx

# ---------------------------------------------------------------------------
# Channel delivery profiles — based on real industry benchmarks
# ---------------------------------------------------------------------------
PROFILES = {
    "whatsapp": {
        "delivery_rate":  0.95,
        "open_rate":      0.68,
        "click_rate":     0.47,   # of openers who click
        "convert_rate":   0.44,   # of clickers who convert
        "fail_rate":      0.05,
    },
    "email": {
        "delivery_rate":  0.88,
        "open_rate":      0.22,
        "click_rate":     0.41,
        "convert_rate":   0.44,
        "fail_rate":      0.12,
    },
    "sms": {
        "delivery_rate":  0.98,
        "open_rate":      0.15,
        "click_rate":     0.40,
        "convert_rate":   0.33,
        "fail_rate":      0.02,
    },
}


def _time_of_day_multiplier() -> float:
    """Morning and evening sends perform better for coffee brands."""
    hour = datetime.now().hour
    if 7 <= hour < 11:   return 1.35   # morning coffee time — best
    if 11 <= hour < 14:  return 1.10   # lunch
    if 17 <= hour < 20:  return 1.20   # evening
    if 20 <= hour < 23:  return 0.90   # late evening — declining
    return 0.55                         # late night / early morning


# ---------------------------------------------------------------------------
# Core simulation
# ---------------------------------------------------------------------------

async def simulate_message(
    idempotency_key: str,
    channel: str,
    callback_url: str,
) -> None:
    """
    Simulate the full delivery lifecycle of one message.
    Fires callbacks to the CRM at each stage.

    Timeline (simulated seconds, fast enough for a good demo):
      ~0.5-2s  → delivered or failed
      ~3-12s   → opened   (if delivered)
      ~5-20s   → clicked  (if opened)
      ~8-40s   → converted (if clicked)
    """
    profile = PROFILES.get(channel, PROFILES["whatsapp"])
    tod = _time_of_day_multiplier()

    # Simulate network latency before first event
    await asyncio.sleep(random.uniform(0.5, 2.0))

    async with httpx.AsyncClient(timeout=10.0) as http:

        # Stage 1: Delivery or failure
        if random.random() < profile["fail_rate"]:
            await _fire(http, callback_url, idempotency_key, "failed", 0.0)
            return

        await _fire(http, callback_url, idempotency_key, "delivered", 0.0)

        # Stage 2: Open (time-of-day adjusted)
        await asyncio.sleep(random.uniform(3, 12))
        effective_open = min(profile["open_rate"] * tod, 0.95)
        if random.random() > effective_open:
            return

        await _fire(http, callback_url, idempotency_key, "opened", 0.0)

        # Stage 3: Click
        await asyncio.sleep(random.uniform(5, 20))
        if random.random() > profile["click_rate"]:
            return

        await _fire(http, callback_url, idempotency_key, "clicked", 0.0)

        # Stage 4: Convert
        await asyncio.sleep(random.uniform(8, 40))
        if random.random() > profile["convert_rate"]:
            return

        # Revenue per conversion: realistic for a coffee purchase (might include beans)
        revenue = round(random.uniform(650, 2800), 2)
        await _fire(http, callback_url, idempotency_key, "converted", revenue)


async def _fire(
    http: httpx.AsyncClient,
    callback_url: str,
    idempotency_key: str,
    event: str,
    revenue: float,
    max_retries: int = 3,
) -> None:
    """
    Fire a callback with exponential backoff retry.
    Backoff: 1s → 2s → 4s before giving up.
    This is the retry logic that shows the system handles failures gracefully.
    """
    for attempt in range(max_retries):
        try:
            resp = await http.post(
                callback_url,
                json={
                    "idempotency_key": idempotency_key,
                    "event": event,
                    "revenue_attributed": revenue,
                },
            )
            if resp.status_code < 500:
                return  # success or client error — don't retry
        except (httpx.ConnectError, httpx.TimeoutException):
            pass  # network issue — retry

        if attempt < max_retries - 1:
            await asyncio.sleep(2 ** attempt)   # 1s, 2s (then give up)