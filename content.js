// Content script — injected into AI chat pages
(function() {
  'use strict';

  // PromptOptimizer loaded first via manifest.json
  // Safety check: wait for class if not immediately visible
  if (typeof PromptOptimizer === 'undefined') {
    console.warn('[GreenPrompt] PromptOptimizer not found, waiting…');
    setTimeout(init, 500);
    return;
  }

  const optimizer = new PromptOptimizer();
  optimizer.detectPlatformTier(window.location.hostname);

  let optimizerButton = null;
  let optimizerPanel  = null;
  let currentTextarea = null;
  let liveDebounce    = null;  // for real-time validation debounce

  // ── Textarea helpers ──────────────────────────────────────────────────────

  function findTextarea() {
    const selectors = [
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Chat"]',
      'textarea#prompt-textarea',
      'textarea[data-id="root"]',
      '.ProseMirror',
      '[contenteditable="true"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function getTextFromElement(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA') return el.value;
    if (el.hasAttribute('contenteditable')) return el.innerText || el.textContent;
    return '';
  }

  function setTextToElement(el, text) {
    if (!el) return;
    if (el.tagName === 'TEXTAREA') {
      // Native input setter so React/Vue state picks up the change
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      nativeSetter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.hasAttribute('contenteditable')) {
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // ── Real-time live indicator ──────────────────────────────────────────────
  // Shows a small badge on the Optimize button with current prompt's token count
  // and a colour hint (green = already short, yellow = moderate, red = long)

  function attachLiveListener(textarea) {
    if (!textarea || textarea._gpListening) return;
    textarea._gpListening = true;

    textarea.addEventListener('input', () => {
      clearTimeout(liveDebounce);
      liveDebounce = setTimeout(() => updateLiveBadge(textarea), 600);
    });
  }

  function updateLiveBadge(textarea) {
    const text   = getTextFromElement(textarea);
    const tokens = Math.max(1, Math.ceil(text.length / 3.5));
    const badge  = document.getElementById('gp-live-badge');
    if (!badge) return;

    badge.textContent = `${tokens} tokens`;

    // P2-4: Keep button tooltip in sync with current token count
    if (optimizerButton) {
      optimizerButton.title = `${tokens} tokens — click to optimize`;
    }

    // Colour coding
    if (tokens < 50)       { badge.style.background = '#10b981'; }  // green — short
    else if (tokens < 150) { badge.style.background = '#f59e0b'; }  // yellow — moderate
    else                   { badge.style.background = '#ef4444'; }  // red — long, worth optimizing
  }

  // ── UI construction ───────────────────────────────────────────────────────

  function createOptimizerButton() {
    const wrapper = document.createElement('div');
    wrapper.id    = 'gp-btn-wrapper';
    wrapper.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      display: flex; flex-direction: column; align-items: flex-end;
      gap: 6px; z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Live token badge above the button
    const badge = document.createElement('div');
    badge.id    = 'gp-live-badge';
    badge.style.cssText = `
      background: #10b981; color: white;
      font-size: 11px; font-weight: 600; padding: 3px 8px;
      border-radius: 12px; display: none;
      transition: background 0.3s;
    `;
    badge.textContent = '0 tokens';

    const btn = document.createElement('button');
    btn.id    = 'prompt-optimizer-btn';
    btn.title = 'Optimize your prompt to save energy';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
      <span>Optimize</span>
    `;
    btn.addEventListener('click', handleOptimizeClick);

    wrapper.appendChild(badge);
    wrapper.appendChild(btn);
    return wrapper;
  }

  function createOptimizerPanel() {
    const panel = document.createElement('div');
    panel.id    = 'prompt-optimizer-panel';
    panel.innerHTML = `
      <div class="optimizer-header">
        <h3>🌱 Prompt Optimization</h3>
        <button class="close-btn" id="optimizer-close">×</button>
      </div>
      <div class="optimizer-content">

        <div class="optimizer-section">
          <h4>Original Prompt</h4>
          <div class="text-display" id="original-text"></div>
          <div class="stats" id="original-stats"></div>
        </div>

        <div class="optimizer-section optimized">
          <h4>✨ Optimized Prompt</h4>
          <div class="text-display" id="optimized-text"></div>
          <div class="stats" id="optimized-stats"></div>
        </div>

        <div class="optimizer-section savings">
          <h4>💚 Environmental Impact — Wastage Avoided</h4>
          <div class="savings-grid">
            <div class="saving-item">
              <span class="label">CO₂ Wastage</span>
              <span class="value" id="co2-saved">0 g</span>
            </div>
            <div class="saving-item">
              <span class="label">Water Wastage</span>
              <span class="value" id="water-saved">0 ml</span>
            </div>
            <div class="saving-item">
              <span class="label">Energy Wastage</span>
              <span class="value" id="energy-saved">0 Wh</span>
            </div>
            <div class="saving-item">
              <span class="label">Tokens Avoided</span>
              <span class="value" id="tokens-saved">0</span>
            </div>
          </div>
          <div class="reduction-percentage" id="reduction-pct"></div>
          <div class="model-info" id="model-info"></div>
        </div>

        <div class="optimizer-section suggestions">
          <h4>What Changed</h4>
          <ul id="suggestions-list"></ul>
        </div>

        <div class="optimizer-actions">
          <button class="btn-secondary" id="btn-keep-original">Keep Original</button>
          <button class="btn-copy"      id="btn-copy-optimized" title="Copy optimized prompt to clipboard">📋 Copy</button>
          <button class="btn-primary"   id="btn-use-optimized">Use Optimized ✨</button>
        </div>

      </div>
    `;

    panel.querySelector('#optimizer-close').addEventListener('click',   () => closePanel());
    panel.querySelector('#btn-keep-original').addEventListener('click', () => closePanel());
    panel.querySelector('#btn-use-optimized').addEventListener('click', handleUseOptimized);
    panel.querySelector('#btn-copy-optimized').addEventListener('click', handleCopyOptimized);

    return panel;
  }

  function closePanel() {
    optimizerPanel.style.display = 'none';
  }

  // ── Core handlers ─────────────────────────────────────────────────────────

  function handleOptimizeClick() {
    currentTextarea = findTextarea();

    if (!currentTextarea) {
      alert('Could not find the input field. Please try again.');
      return;
    }

    const originalText = getTextFromElement(currentTextarea);

    if (!originalText || originalText.trim().length === 0) {
      alert('Please type a prompt first!');
      return;
    }

    if (originalText.trim().length < 20) {
      alert('Your prompt is already very short — no optimization needed!');
      return;
    }

    // P3-9: Loading state — give user immediate feedback before NLP runs
    const btnSpan = optimizerButton ? optimizerButton.querySelector('span') : null;
    if (optimizerButton) {
      optimizerButton.disabled = true;
      if (btnSpan) btnSpan.textContent = 'Analyzing…';
    }

    // Use setTimeout(0) to let the DOM repaint the loading state first
    setTimeout(() => {
      const optimizedText = optimizer.optimizePrompt(originalText);
      const savings       = optimizer.calculateSavings(originalText, optimizedText);
      const suggestions   = optimizer.generateSuggestions(originalText, optimizedText);

      updatePanel(originalText, optimizedText, savings, suggestions);
      optimizerPanel.style.display = 'block';

      // Restore button
      if (optimizerButton) {
        optimizerButton.disabled = false;
        if (btnSpan) btnSpan.textContent = 'Optimize';
      }

      // Store pending savings — only committed when user clicks "Use Optimized"
      optimizerPanel._pendingSavings = savings;
    }, 0);
  }

  function handleUseOptimized() {
    const optimizedText = optimizerPanel.dataset.optimizedText;

    if (currentTextarea && optimizedText) {
      setTextToElement(currentTextarea, optimizedText);
      closePanel();
      showNotification('Optimized prompt applied! 🌱');

      // Only commit savings to storage when user ACCEPTS the optimization
      const savings = optimizerPanel._pendingSavings;
      if (savings) {
        commitSavings(savings);
        optimizerPanel._pendingSavings = null;
      }

      // Update live badge immediately
      updateLiveBadge(currentTextarea);
    }
  }

  /** P2-5: Copy optimized text to clipboard without replacing the input */
  function handleCopyOptimized() {
    const optimizedText = optimizerPanel.dataset.optimizedText;
    if (!optimizedText) return;
    navigator.clipboard.writeText(optimizedText).then(() => {
      showNotification('Optimized prompt copied! 📋');
    }).catch(() => {
      // Fallback for browsers/contexts that block clipboard API
      const ta = document.createElement('textarea');
      ta.value = optimizedText;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showNotification('Optimized prompt copied! 📋');
    });
  }

  // ── Formatters (synced with popup.js for consistency) ─────────────────────

  function formatCO2(grams) {
    const g = parseFloat(grams) || 0;
    if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    if (g >= 1) return `${g.toFixed(2)} g`;
    return `${(g * 1000).toFixed(1)} mg`;
  }

  function formatWater(ml) {
    const v = parseFloat(ml) || 0;
    if (v >= 1000) return `${(v / 1000).toFixed(2)} L`;
    if (v >= 1) return `${v.toFixed(1)} ml`;
    return `${(v * 1000).toFixed(0)} µL`;
  }

  function formatEnergy(wh) {
    const v = parseFloat(wh) || 0;
    if (v >= 1000) return `${(v / 1000).toFixed(3)} kWh`;
    if (v >= 1) return `${v.toFixed(2)} Wh`;
    return `${(v * 1000).toFixed(1)} mWh`;
  }

  // ── Panel update ──────────────────────────────────────────────────────────

  function updatePanel(original, optimized, savings, suggestions) {
    if (!document.body.contains(optimizerPanel)) {
      document.body.appendChild(optimizerPanel);
    }

    optimizerPanel.querySelector('#original-text').textContent  = original;
    optimizerPanel.querySelector('#optimized-text').textContent = optimized;

    optimizerPanel.querySelector('#original-stats').innerHTML =
      `${savings.original.chars} chars · ${savings.original.tokens} tokens · ${formatEnergy(savings.original.energy_wh)}`;

    optimizerPanel.querySelector('#optimized-stats').innerHTML =
      `${savings.optimized.chars} chars · ${savings.optimized.tokens} tokens · ${formatEnergy(savings.optimized.energy_wh)}`;

    optimizerPanel.querySelector('#co2-saved').textContent    = formatCO2(savings.saved.co2);
    optimizerPanel.querySelector('#water-saved').textContent  = formatWater(savings.saved.water);
    optimizerPanel.querySelector('#energy-saved').innerHTML = `
      <div style="line-height: 1.2;">
        <span style="font-weight: bold; color: #059669;">${formatEnergy(savings.saved.net_energy_wh)} Net ROI</span>
        <div style="font-size: 9px; color: #6b7280; font-weight: normal; margin-top: 3px;">
          Saved (LLM): +${formatEnergy(savings.saved.energy_wh)}<br>
          Spend (JS): −${formatEnergy(savings.saved.execution_cost_wh)}
        </div>
      </div>
    `;
    optimizerPanel.querySelector('#tokens-saved').textContent = savings.saved.tokens;

    // Sustainability grade
    const grade = savings.saved.grade || { label: '✅ Already Optimized', color: '#10b981' };
    const pct   = parseFloat(savings.saved.percentage);
    optimizerPanel.querySelector('#reduction-pct').innerHTML = `
      <span class="grade-badge" style="background:${grade.color}">${grade.label}</span>
      ${pct > 0 ? `<span class="reduction-num">${pct}% smaller prompt</span>` : ''}
    `;

    // Model + methodology + intent
    const intentEmoji = {
      code:'💻', explain:'📖', list:'📋', compare:'⚖️', creative:'🎨', general:'💬'
    };
    const sensitivityHtml = savings.meta.sensitivityFlag
      ? `<small style="color:#ef4444;font-weight:600;">${savings.meta.sensitivityFlag}</small>`
      : '';
    // P1-1: Add providerLabel to model-info block
    optimizerPanel.querySelector('#model-info').innerHTML = `
      <small>${intentEmoji[savings.meta.intent] || '💬'} Intent: <strong>${savings.meta.intent}</strong> · 🤖 ${savings.meta.tierLabel}</small>
      <small>🏢 Provider: ${savings.meta.providerLabel}</small>
      <small>📍 Carbon: ${savings.meta.carbonIntensity} gCO₂e/kWh · PUE: ${savings.meta.pue} · WUE: ${savings.meta.wue} L/kWh</small>
      <small style="color:#059669; font-weight: 600;">🚀 Enterprise Scale Demo: Impact projected over 50,000 invocations</small>
      ${sensitivityHtml}
    `;

    optimizerPanel.querySelector('#suggestions-list').innerHTML =
      suggestions.map(s => `<li>${s}</li>`).join('');

    optimizerPanel.dataset.optimizedText = optimized;
  }

  // ── Storage — only commits when user accepts optimized prompt ─────────────

  function commitSavings(savings) {
    chrome.storage.local.get(['totalSavings', 'recentOptimizations'], (result) => {
      // ── Cumulative totals ──
      const total = result.totalSavings || {
        co2: 0, water: 0, energy: 0, chars: 0, optimizations: 0,
        originalEnergy: 0, optimizedEnergy: 0
      };

      total.co2           += savings.saved.co2;    // grams
      total.water         += savings.saved.water;  // ml
      total.energy        += savings.saved.energy; // kWh
      total.originalEnergy += parseFloat(savings.original.energy_wh) / 1000;
      total.optimizedEnergy += parseFloat(savings.optimized.energy_wh) / 1000;
      total.chars         += savings.saved.chars;
      total.optimizations += 1;

      // ── Recent history (last 10 accepted optimizations) for dashboard ──
      const history = result.recentOptimizations || [];
      history.unshift({
        timestamp:       Date.now(),
        originalChars:   savings.original.chars,
        optimizedChars:  savings.optimized.chars,
        tokensSaved:     savings.saved.tokens,
        co2Saved:        savings.saved.co2,
        waterSaved:      savings.saved.water,
        energySaved_wh:  savings.saved.net_energy_wh,
        grossEnergySaved: savings.saved.energy_wh,
        executionCostWh:  savings.saved.execution_cost_wh,
        originalEnergyWh: savings.original.energy_wh,
        optimizedEnergyWh: savings.optimized.energy_wh,
        percentage:      savings.saved.percentage,
        tier:            savings.meta.tier,
        intent:          savings.meta.intent,
        grade:           savings.saved.grade ? savings.saved.grade.label : null,
        sensitivityFlag: savings.meta.sensitivityFlag || null
      });
      if (history.length > 10) history.length = 10;

      chrome.storage.local.set({ totalSavings: total, recentOptimizations: history });
    });
  }

  // ── Notification ──────────────────────────────────────────────────────────

  function showNotification(message) {
    const n = document.createElement('div');
    n.className   = 'optimizer-notification';
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 10);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    const wrapper = createOptimizerButton();
    document.body.appendChild(wrapper);
    optimizerButton = wrapper.querySelector('#prompt-optimizer-btn');

    optimizerPanel = createOptimizerPanel();
    document.body.appendChild(optimizerPanel);

    // Attach live listener to existing textarea
    const ta = findTextarea();
    if (ta) {
      attachLiveListener(ta);
      document.getElementById('gp-live-badge').style.display = 'block';
    }

    // Re-attach if SPA navigation swaps the textarea
    const observer = new MutationObserver(() => {
      const ta = findTextarea();
      if (ta && !ta._gpListening) {
        attachLiveListener(ta);
        const badge = document.getElementById('gp-live-badge');
        if (badge) badge.style.display = 'block';
      }
      // Keep button in DOM
      const wrapperEl = document.getElementById('gp-btn-wrapper');
      if (!document.body.contains(wrapperEl)) {
        document.body.appendChild(wrapper);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
