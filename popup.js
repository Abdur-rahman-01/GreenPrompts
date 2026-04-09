// Popup dashboard — shows cumulative stats + history of accepted optimizations

document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  document.getElementById('reset-stats').addEventListener('click', resetStats);
});

// ── Load everything ───────────────────────────────────────────────────────────

function loadAll() {
  chrome.storage.local.get(['totalSavings', 'recentOptimizations'], (result) => {
    renderTotals(result.totalSavings || { co2:0, water:0, energy:0, chars:0, optimizations:0 });
    renderHistory(result.recentOptimizations || []);
  });
}

// ── Totals ────────────────────────────────────────────────────────────────────

function renderTotals(s) {
  document.getElementById('total-co2').textContent           = formatCO2(s.co2);
  document.getElementById('total-water').textContent         = formatWater(s.water);
  document.getElementById('total-energy').textContent        = formatEnergy(s.energy);
  document.getElementById('total-optimizations').textContent = s.optimizations;

  // P2-7: Toggle breakdown visibility if data exists
  if (s.originalEnergy || s.optimizedEnergy) {
    const detail = document.getElementById('total-energy-detail');
    if (detail) {
      detail.style.display = 'block';
      document.getElementById('total-original').textContent = formatEnergy(s.originalEnergy);
      document.getElementById('total-optimized').textContent = formatEnergy(s.optimizedEnergy);
    }
  }
}

// ── Recent history dashboard ──────────────────────────────────────────────────

function renderHistory(history) {
  const container = document.getElementById('recent-list');

  if (!history || history.length === 0) {
    container.innerHTML = `<p class="empty-state">No optimizations accepted yet.<br>
      Type a prompt, click Optimize, then accept it!</p>`;
    return;
  }

  container.innerHTML = history.map((item, i) => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

    const pct = parseFloat(item.percentage) || 0;
    const barWidth = Math.min(100, Math.max(0, pct));

    const intentIcon = {
      code:'💻', explain:'📖', list:'📋', compare:'⚖️',
      creative:'🎨', academic:'🎓', general:'💬'
    };

    // P2-6: Build a shareable copy payload for this history card
    const gradeText = item.grade || '✅ Already Optimized';
    const copyPayload = JSON.stringify({ text: `${gradeText} — ${pct}% smaller prompt (GreenPrompt)`, i }).replace(/"/g, '&quot;');

    return `
      <div class="history-item" 
           data-copy-payload="${gradeText} — ${pct}% smaller prompt (GreenPrompt)"
           title="Click to copy stats">
        <div class="history-header">
          <span class="history-index">#${history.length - i}</span>
          <span class="history-time">${dateStr} ${timeStr}</span>
          <span class="history-intent">${intentIcon[item.intent] || '💬'}</span>
          <span class="history-tier tier-${item.tier || 'medium'}">${tierLabel(item.tier)}</span>
        </div>
        ${item.grade ? `<div class="history-grade">${item.grade}</div>` : ''}
        <div class="history-bar-row">
          <div class="history-bar-bg">
            <div class="history-bar-fill" style="width:${barWidth}%"></div>
          </div>
          <span class="history-pct">${pct}% smaller</span>
        </div>
        <div class="history-metrics">
          <span>🔤 ${item.originalChars}→${item.optimizedChars} chars</span>
          <span>🌍 −${formatCO2(item.co2Saved)}</span>
          <span>💧 −${formatWater(item.waterSaved)}</span>
          ${item.originalEnergyWh 
            ? `<span class="energy-compare" title="Green ROI Pipeline:&#10;+ ${item.grossEnergySaved || item.energySaved_wh} Wh (LLM Energy Avoided)&#10;- ${item.executionCostWh || 0} Wh (JS Execution Cost)&#10;= ${item.energySaved_wh} Wh (Net ROI)">⚡ ${formatEnergy(item.originalEnergyWh/1000)} → ${formatEnergy(item.optimizedEnergyWh/1000)}</span>`
            : `<span>⚡ −${item.energySaved_wh} Wh</span>`
          }
          ${item.sensitivityFlag ? '<span style="color:#ef4444">⚠️ Sensitive</span>' : ''}
        </div>
        <div class="history-copy-hint" style="font-size:10px;opacity:0.55;margin-top:4px;text-align:right">📋 tap to copy</div>
      </div>
    `;
  }).join('');

  // Add event listeners for the new items (delegation)
  container.querySelectorAll('.history-item').forEach(el => {
    el.onclick = () => {
      const payload = el.dataset.copyPayload;
      navigator.clipboard.writeText(payload)
        .then(() => flash('Copied!'))
        .catch(() => flash('Copied!'));
    };
  });
}

function flash(msg) {
  const h1 = document.querySelector('h1');
  const oldText = h1.textContent;
  h1.textContent = msg;
  h1.style.color = '#10b981';
  setTimeout(() => {
    h1.textContent = oldText;
    h1.style.color = '';
  }, 1000);
}

function tierLabel(tier) {
  const labels = { large: 'Large', medium: 'Medium', small: 'Small' };
  return labels[tier] || 'Medium';
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCO2(grams) {
  const g = parseFloat(grams) || 0;
  if (g >= 1000) return `${(g/1000).toFixed(2)} kg`;
  if (g >= 1)    return `${g.toFixed(2)} g`;
  return `${(g*1000).toFixed(1)} mg`;
}

function formatWater(ml) {
  const v = parseFloat(ml) || 0;
  if (v >= 1000) return `${(v/1000).toFixed(2)} L`;
  if (v >= 1)    return `${v.toFixed(1)} ml`;
  return `${(v*1000).toFixed(0)} µL`;
}

function formatEnergy(kwh) {
  const v = parseFloat(kwh) || 0;
  if (v >= 1)        return `${v.toFixed(3)} kWh`;
  if (v >= 0.001)    return `${(v*1000).toFixed(2)} Wh`;
  if (v >= 0.000001) return `${(v*1000000).toFixed(1)} mWh`;
  return `${v.toExponential(2)} kWh`;
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetStats() {
  if (!confirm('Reset all statistics and history?')) return;
  chrome.storage.local.set({
    totalSavings: { co2:0, water:0, energy:0, chars:0, optimizations:0 },
    recentOptimizations: []
  }, () => {
    loadAll();
    flash('Reset!');
  });
}
