"""Plot completed FARM100 measurements; never substitutes for the raw acceptance report."""
import json
import math
import statistics
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

root = Path(sys.argv[1]).resolve()
report = json.loads((root / "performance-qa.json").read_text(encoding="utf-8"))
assert report.get("completedAt"), "Wait for the completed measurement report"
samples = [json.loads(line) for line in (root / "performance-samples.jsonl").read_text(encoding="utf-8").splitlines() if line]
minutes = [s["elapsedMs"] / 60000 for s in samples]
groups = {name: [] for name in ["Total", "Renderer", "Runner", "GPU", "Host"]}
for sample in samples:
    values = dict.fromkeys(groups, 0.0)
    for process in sample["processes"]:
        mib = process["memory"]["workingSetSize"] / 1024
        values["Total"] += mib
        key = "Runner" if process.get("name") == "FARM100 garden runner" else {"Tab": "Renderer", "GPU": "GPU", "Browser": "Host"}.get(process["type"])
        if key:
            values[key] += mib
    for key in groups:
        groups[key].append(values[key])

plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": "#f7f8fa", "axes.facecolor": "#ffffff"})
fig, axes = plt.subplots(3, 1, figsize=(12, 11), gridspec_kw={"height_ratios": [1.2, 1, 1]}, constrained_layout=True)
fig.suptitle(f"FARM100 | 32 x 32 / 8 drones / mixed production\n{report['seconds']} seconds, 1920 x 1080, p95 {report['p95Ms']:.1f} ms", fontsize=17, weight="bold")
colors = ["#163d36", "#3d79ad", "#ca7c27", "#8170aa", "#8d9895"]
for (name, values), color in zip(groups.items(), colors):
    axes[0].plot(minutes, values, label=name, color=color, linewidth=2 if name == "Total" else 1.2)
axes[0].set(title="Process working sets (sum includes shared pages)", ylabel="MiB", xlabel="Elapsed minutes")
axes[0].legend(ncol=5, frameon=False, loc="upper left")
axes[0].grid(alpha=.2)

frame_rates, previous_frames, previous_ms = [], 0, 0
for sample in samples:
    frame_rates.append((sample["frames"] - previous_frames) * 1000 / (sample["elapsedMs"] - previous_ms))
    previous_frames, previous_ms = sample["frames"], sample["elapsedMs"]
axes[1].plot(minutes, frame_rates, color="#3d79ad", label="rAF callbacks / second")
axes[1].set(title="Frame delivery and committed production", ylabel="Callbacks / second", xlabel="Elapsed minutes")
axes[1].set_ylim(bottom=0)
events_axis = axes[1].twinx()
events_axis.spines["right"].set_visible(True)
events_axis.plot(minutes, [s["events"] / 1000 for s in samples], color="#ca7c27", label="Committed events")
events_axis.set_ylabel("Events (thousands)", color="#a66720")
axes[1].grid(alpha=.2)

histogram = report["timing"]["histogram"]
limit = max(25, min(70, math.ceil(report["timing"]["maxFrame"]) + 1))
bins = [sum(histogram[i * 10:(i + 1) * 10]) for i in range(limit)]
axes[2].bar(range(limit), bins, width=.9, align="edge", color=["#438575" if i < 20 else "#c76845" for i in range(limit)])
axes[2].axvline(report["p95Ms"], color="#163d36", linestyle="--", label=f"p95 {report['p95Ms']:.1f} ms")
axes[2].axvline(20, color="#b24735", linestyle=":", label="20 ms target")
axes[2].set_yscale("log")
axes[2].set(title=f"Frame intervals | max {report['timing']['maxFrame']:.1f} ms | {sum(histogram[limit*10:])} frames outside shown range", xlabel="Frame interval (ms, grouped in 1 ms bins)", ylabel="Frame count (log)", xlim=(0, limit))
axes[2].legend(frameon=False)
axes[2].grid(axis="y", alpha=.2)
fig.savefig(root / "performance-overview.png", dpi=150)
fig.savefig(root / "performance-overview.svg")

tail = max(1, len(samples) // 3)
observation = {
    "source": str(root), "samples": len(samples), "minutes": minutes[-1],
    "p95Ms": report["p95Ms"], "maxFrameMs": report["timing"]["maxFrame"],
    "workingSetMiB": {"first": groups["Total"][0], "last": groups["Total"][-1], "max": max(groups["Total"]), "middleMedian": statistics.median(groups["Total"][tail:tail*2]), "lastMedian": statistics.median(groups["Total"][-tail:])},
    "lastThirdSlopeMiBPerMinute": statistics.linear_regression(minutes[-tail:], groups["Total"][-tail:]).slope if tail > 1 else None,
    "production": {"events": samples[-1]["events"], "actions": samples[-1]["actions"], "planted": samples[-1]["planted"], "contention": samples[-1]["contention"]},
    "limits": ["A working-set curve does not independently prove absence of leaks", "rAF callback frequency is not a GPU execution-time measurement", "See raw samples and the original acceptance checks"],
}
(root / "performance-observation.json").write_text(json.dumps(observation, indent=2), encoding="utf-8")
print(json.dumps(observation, indent=2))
