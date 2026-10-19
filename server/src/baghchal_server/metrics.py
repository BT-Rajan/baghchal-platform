"""Prometheus metrics, served at ``/metrics`` for a scraper holding ``BAGHCHAL_METRICS_TOKEN``.

Each server process keeps its own counters; Prometheus scrapes every replica and adds them up.
Requests are labelled by route template (``/api/v1/games/{game_id}``), never by raw path, so
the number of series stays small.
"""

from typing import Final

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

from baghchal_server.mail import Mail, Mailer

LATENCY_BUCKETS: Final = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)


class Metrics:
    def __init__(self) -> None:
        self.registry = CollectorRegistry()
        r = self.registry
        self.requests = Counter(
            "baghchal_http_requests",
            "HTTP requests answered, by route template and status.",
            ["method", "route", "status"],
            registry=r,
        )
        self.latency = Histogram(
            "baghchal_http_request_duration_seconds",
            "Time to answer an HTTP request.",
            ["method", "route"],
            buckets=LATENCY_BUCKETS,
            registry=r,
        )
        self.sockets = Gauge(
            "baghchal_websocket_connections", "Open WebSocket connections.", registry=r
        )
        self.live_games = Gauge(
            "baghchal_live_games", "Games in progress (read when scraped).", registry=r
        )
        self.sweeps = Counter("baghchal_sweeper_runs", "Sweeps for games out of time.", registry=r)
        self.sweep_failures = Counter(
            "baghchal_sweeper_failures", "Sweeps that raised an error.", registry=r
        )
        self.expired = Counter(
            "baghchal_games_ended_on_time", "Games the sweeper ended on time.", registry=r
        )
        self.fair_play_queue = Gauge(
            "baghchal_fair_play_queue", "Rated games waiting for their fair-play check.", registry=r
        )
        self.fair_play_checked = Counter(
            "baghchal_fair_play_checked", "Games given a fair-play check.", registry=r
        )
        self.fair_play_failures = Counter(
            "baghchal_fair_play_failures", "Fair-play checks that raised an error.", registry=r
        )
        self.fair_play_skipped = Counter(
            "baghchal_fair_play_skipped",
            "Fair-play checks skipped after waiting too long in the queue.",
            registry=r,
        )
        self.fair_play_reports = Counter(
            "baghchal_fair_play_reports", "Automatic fair-play reports filed.", registry=r
        )
        self.mail = Counter(
            "baghchal_mail", "Emails handed to the mail server, by result.", ["result"], registry=r
        )
        self.rate_limited = Counter(
            "baghchal_rate_limited",
            "Requests refused by a rate limit, by limit.",
            ["limit"],
            registry=r,
        )


class CountingMailer:
    """Counts emails sent and failed, around the real mailer."""

    def __init__(self, inner: Mailer, metrics: Metrics) -> None:
        self.inner = inner
        self.metrics = metrics

    async def send(self, mail: Mail) -> None:
        try:
            await self.inner.send(mail)
        except Exception:
            self.metrics.mail.labels("failed").inc()
            raise
        self.metrics.mail.labels("sent").inc()
