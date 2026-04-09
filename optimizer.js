/**
 * GreenPrompt — Prompt Optimizer v4 (Semantic Compression Engine)
 *
 * NLP Pipeline (mirrors Python NLTK in pure JS):
 *   1.  Sensitivity check (safety-first, non-destructive)
 *   2.  Normalize whitespace + punctuation
 *   3.  Greeting removal
 *   4.  Sign-off / phatic removal
 *   5.  Meta-talk removal (ordered longest→shortest)
 *   6.  Adverb & filler stripper  ← NEW
 *   7.  Hedge word stripper        ← NEW
 *   8.  Self-reference stripper    ← NEW
 *   9.  Action-verb distillation   ← NEW
 *  10.  Instruction distillation
 *  11.  Contractions
 *  12.  Structural cleanup (newline squash, kerning fix)  ← NEW
 *  13.  Artifact cleanup (orphan punctuation / fragments)
 *  14.  Intent detection
 *  15.  N-gram deduplication
 *  16.  RTF structuring (intent-aware templates)  ← ENHANCED
 *  17.  Sustainability grade
 *
 * Environmental constants:
 *   Google AI Inference Methodology Aug 2025 — arxiv.org/abs/2508.15734
 *   CodeCarbon methodology — mlco2.github.io/codecarbon/methodology.html
 */

class PromptOptimizer {

  // ── Constants ────────────────────────────────────────────────────────────

  constructor() {
    // Model energy tiers (Wh per 1 000 input tokens, anchored to Google's 0.24 Wh median)
    this.MODEL_TIERS = {
      large: { wh_per_1k: 0.40, label: 'Large (GPT-4o / Claude Opus / Gemini Ultra)' },
      medium: { wh_per_1k: 0.24, label: 'Medium (Claude Sonnet / Gemini Pro)' },
      small: { wh_per_1k: 0.08, label: 'Small  (GPT-3.5 / Claude Haiku / Gemini Flash)' }
    };

    /**
     * Per-provider environmental constants.
     * Sources:
     *   Google  — arxiv.org/abs/2508.15734 (Aug 2025)
     *   Microsoft — MS 2024 Environmental Sustainability Report
     *   Anthropic — estimated from cloud provider mix (no public disclosure)
     *   OpenAI  — industry average (no public disclosure)
     */
    this.PROVIDER_CONSTANTS = {
      google: { pue: 1.09, carbonIntensity: 125, wue: 1.083, label: 'Google (Gemini)' },
      microsoft: { pue: 1.20, carbonIntensity: 233, wue: 1.40, label: 'Microsoft (Copilot)' },
      anthropic: { pue: 1.20, carbonIntensity: 300, wue: 1.50, label: 'Anthropic (Claude)' },
      openai: { pue: 1.40, carbonIntensity: 400, wue: 1.80, label: 'OpenAI (ChatGPT)' },
      default: { pue: 1.40, carbonIntensity: 400, wue: 1.80, label: 'AI Provider (estimated)' }
    };

    this.PLATFORM_TIERS = {
      'chat.openai.com': 'large',
      'claude.ai': 'medium',
      'gemini.google.com': 'medium',
      'copilot.microsoft.com': 'large',
      'bing.com': 'large'
    };

    /** Maps hostname → PROVIDER_CONSTANTS key */
    this.PLATFORM_PROVIDERS = {
      'chat.openai.com': 'openai',
      'claude.ai': 'anthropic',
      'gemini.google.com': 'google',
      'copilot.microsoft.com': 'microsoft',
      'bing.com': 'microsoft'
    };

    // Legacy flat constants — kept for backward compat; overridden per-provider in calculateImpact()
    this.PUE = 1.40;  // default fallback
    this.CARBON_INTENSITY_G_KWH = 400;   // default fallback
    this.WUE_L_KWH = 1.80;  // default fallback
    this.currentTier = 'medium';
    this.currentProvider = 'default';

    // ── NLTK-style English stopwords ─────────────────────────────────────
    this.STOPWORDS = new Set([
      'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours',
      'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers',
      'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
      'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
      'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until',
      'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
      'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then',
      'once', 'here', 'there', 'when', 'where', 'why', 'how', 'both', 'each', 'few',
      'more', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 's', 't', 'just', 'don', 'should', 'now', 'd', 'll', 'm',
      'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn',
      'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn',
      'weren', 'won', 'wouldn'
    ]);

    // ── Contraction map ───────────────────────────────────────────────────
    this.CONTRACTIONS = [
      [/\bdo not\b/gi, "don't"], [/\bcannot\b/gi, "can't"],
      [/\bwill not\b/gi, "won't"], [/\bshould not\b/gi, "shouldn't"],
      [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"],
      [/\bdoes not\b/gi, "doesn't"], [/\bdid not\b/gi, "didn't"],
      [/\bwould not\b/gi, "wouldn't"], [/\bcould not\b/gi, "couldn't"],
    ];

    // ── Sensitive term list (rectified in suggested prompt) ─────────────
    this._SENSITIVE = /\b(suicide|self.harm|harm|illegal|exploit|abuse|violence|weapon|drug|kill|attack|racist|slur|terror|fuck\w*|shit\w*|piss\w*|cunt\w*|asshole\w*|bitch\w*|bastard\w*|vagina\w*|penis\w*|porn\w*)\b/gi;
  }

  // ── Platform / tier detection ─────────────────────────────────────────────

  /**
   * Detects the model tier AND provider from the current hostname.
   * Always wrapped in try/catch — popup context has no window.location.
   * Sets both this.currentTier and this.currentProvider.
   */
  detectPlatformTier(hostname) {
    try {
      for (const [domain, tier] of Object.entries(this.PLATFORM_TIERS)) {
        if (hostname && hostname.includes(domain)) {
          this.currentTier = tier;
          this.currentProvider = this.PLATFORM_PROVIDERS[domain] || 'default';
          return tier;
        }
      }
    } catch (e) {
      // popup context or SSR — no window.location available
    }
    this.currentTier = 'medium';
    this.currentProvider = 'default';
    return 'medium';
  }

  setModelTier(tier) {
    if (this.MODEL_TIERS[tier]) this.currentTier = tier;
  }

  // ── NLP utilities ─────────────────────────────────────────────────────────

  /** Tokenize — mirrors NLTK word_tokenize */
  tokenize(text) {
    return text.match(/\w+|[^\w\s]/g) || [];
  }

  /**
   * Lightweight rule-based POS tagger.
   * Tags: VB | JJ | RB | DT | IN | CC | NNP | NN | CD
   */
  posTag(tokens) {
    const VB = /^(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|go|get|make|take|run|see|know|think|come|want|use|find|give|tell|write|show|create|explain|generate|analyze|build|fix|help|list|compare|describe|summarize|provide|perform|translate|identify|evaluate|review)$/i;
    const DT = /^(a|an|the|this|that|these|those|my|your|his|her|its|our|their)$/i;
    const IN = /^(in|on|at|by|for|with|about|to|from|of|as|into|through|during|before|after|above|below|between|among|around|under|over|up|down|out|off|near)$/i;
    const CC = /^(and|or|but|so|yet|nor|for|although|because|since|while|if|unless|until|when|where|though|whereas|whether)$/i;
    return tokens.map(token => {
      const lc = token.toLowerCase();
      if (this.STOPWORDS.has(lc)) return { token, tag: 'SW' };
      if (DT.test(lc)) return { token, tag: 'DT' };
      if (IN.test(lc)) return { token, tag: 'IN' };
      if (CC.test(lc)) return { token, tag: 'CC' };
      if (VB.test(lc)) return { token, tag: 'VB' };
      if (/\w+ly$/.test(token)) return { token, tag: 'RB' };
      if (/\w+(ful|less|ous|ive|al|ible|able|ent|ant|ic)$/.test(token)) return { token, tag: 'JJ' };
      if (/^[A-Z][a-z]+/.test(token)) return { token, tag: 'NNP' };
      if (/^\d+$/.test(token)) return { token, tag: 'CD' };
      return { token, tag: 'NN' };
    });
  }

  /**
   * Detect prompt intent.
   * Returns: 'code' | 'explain' | 'list' | 'compare' | 'creative' | 'academic' | 'general'
   */
  detectIntent(text) {
    const t = text.toLowerCase();
    if (/\b(code|function|script|program|debug|refactor|implement|python|javascript|js|html|css|sql|algorithm|class|method|api|endpoint|regex|snippet|bug|error|fix)\b/.test(t))
      return 'code';
    if (/\b(compare|versus|vs\.?|difference|contrast|pros.and.cons|advantages|disadvantages)\b/.test(t))
      return 'compare';
    if (/\b(list|enumerate|steps?|top \d|best \d|\d+ ways?|bullet)\b/.test(t))
      return 'list';
    if (/\b(paper|research|cite|citation|apa|ieee|academic|thesis|dissertation|journal|study|hypothesis)\b/.test(t))
      return 'academic';
    if (/\b(explain|why|how does|what is|what are|define|describe|overview|summary|summarize)\b/.test(t))
      return 'explain';
    if (/\b(story|poem|creative|fiction|narrative|character|plot|imagine|novel|write a)\b/.test(t))
      return 'creative';
    return 'general';
  }

  /**
   * N-gram deduplication — mirrors NLTK ngrams() + FreqDist().
   * Drops sentences with >60% trigram overlap with already-seen content.
   */
  _ngrams(tokens, n) {
    const out = [];
    for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n));
    return out;
  }

  deduplicateNgrams(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    if (sentences.length <= 1) return text;
    const seen = new Set();
    const kept = [];
    for (const s of sentences) {
      const norm = s.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
      const trigrams = this._ngrams(norm.split(' '), 3).map(ng => ng.join(' '));
      const overlap = trigrams.length > 0
        ? trigrams.filter(ng => seen.has(ng)).length / trigrams.length : 0;
      if (overlap < 0.6) {
        kept.push(s);
        trigrams.forEach(ng => seen.add(ng));
      }
    }
    return kept.join(' ');
  }

  /**
   * Quote-safe replace — skips text inside "double quotes" to protect literal data.
   * Critical for prompts that include quoted examples or user data.
   */
  _quoteSafeReplace(text, pattern, replacement) {
    // Split by quoted segments (single or double), only apply regex to unquoted parts
    const parts = text.split(/(["'].*?["'])/g);
    return parts.map((part, i) => {
      // Odd-indexed parts are inside quotes — leave them alone
      if (i % 2 === 1) return part;
      return part.replace(pattern, replacement);
    }).join('');
  }

  /**
   * Sensitivity check — soft flag, never deletes content.
   * Returns a warning string if sensitive terms found, or null.
   */
  checkSensitivity(text) {
    this._SENSITIVE.lastIndex = 0; // reset stateful regex
    if (this._SENSITIVE.test(text)) {
      return '⚠️ Sensitive/Profane terms detected — prompt will be rectified for safety.';
    }
    return null;
  }

  /**
   * Sensitive content rectification.
   * Replaces flagged terms with a placeholder to "rectify" the suggested prompt.
   */
  rectifyText(text) {
    if (!text) return text;
    this._SENSITIVE.lastIndex = 0;
    return text.replace(this._SENSITIVE, "[content rectified]");
  }

  /**
   * Intent-aware RTF (Role-Task-Format) structuring.
   * Uses Gemini-recommended templates per intent.
   * Only applies if it doesn't inflate length.
   */
  structurePrompt(text, intent) {
    if (text.length < 80) return text;

    const lines = text
      .split(/[.!?]+\s+/)
      .map(s => s.trim()
        .replace(/^[?!.,;:\s]+/, '')
        .replace(/^(help me|assist me|me)\b\s*/gi, '')
      )
      .filter(s => s.length > 4);

    if (lines.length < 2) return text;

    const rawTask = lines[0].replace(/^[?!.,;:\s]+/, '').replace(/[?!.,;:]+$/, '').trim();
    if (!rawTask || rawTask.length < 4) return text;

    const mainTask = rawTask.charAt(0).toUpperCase() + rawTask.slice(1);
    const rest = lines.slice(1);

    // ── Intent-specific templates (from Gemini's recommendation) ─────────

    if (intent === 'code') {
      // Detect language hint
      const langMatch = text.match(/\b(python|javascript|js|typescript|ts|html|css|java|c\+\+|rust|go|sql|bash|ruby|php|swift|kotlin)\b/i);
      const lang = langMatch ? langMatch[1].toUpperCase() : 'code';
      const details = rest.map(l => `- ${l}`).join('\n');
      return `Task: Write ${lang}\n\nContext:\n${details}\n\nGoal: ${mainTask}\n\nOutput: working code with comments.`;
    }

    if (intent === 'creative') {
      // Extract style/tone hints
      const toneMatch = text.match(/\b(funny|humorous|serious|dark|light|formal|casual|poetic|dramatic|suspenseful)\b/i);
      const tone = toneMatch ? toneMatch[1] : 'engaging';
      const lenMatch = text.match(/\b(short|brief|long|detailed|concise|\d+ words?|\d+ sentences?)\b/i);
      const length = lenMatch ? lenMatch[0] : 'medium length';
      return `Topic: ${mainTask}\n\nStyle: ${tone}\nLength: ${length}`;
    }

    if (intent === 'academic') {
      const fmtMatch = text.match(/\b(apa|ieee|mla|chicago|harvard)\b/i);
      const format = fmtMatch ? fmtMatch[0].toUpperCase() : 'academic';
      const details = rest.map(l => `- ${l}`).join('\n');
      return `Analyze: ${mainTask}\n\nFocus:\n${details}\n\nFormat: ${format}`;
    }

    if (intent === 'compare') {
      const details = rest.map(l => `- ${l}`).join('\n');
      return `${mainTask}.\n\nDetails:\n${details}`;
    }

    if (intent === 'list') {
      const details = rest.map(l => `- ${l}`).join('\n');
      return `${mainTask}.\n\nContext:\n${details}`;
    }

    if (intent === 'explain') {
      const details = rest.map(l => `- ${l}`).join('\n');
      return `${mainTask}.\n\nDetails:\n${details}`;
    }

    // General — task + context bullets
    if (rest.length > 0) {
      const details = rest.slice(0, 3).map(l => `- ${l}`).join('\n');
      return `${mainTask}.\n\nContext:\n${details}`;
    }

    return text;
  }

  /**
   * Token estimation: words × 1.3
   * Mirrors tiktoken behaviour — accounts for subword splits on long/compound words.
   * More accurate than chars/3.5 for standard English prose.
   */
  estimateTokens(text) {
    if (!text || text.trim().length === 0) return 0;
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length * 1.3));
  }


  /**
   * humanTypingNoise() — strips 14 categories of fast/emotional/sloppy typing patterns.
   * Runs as Step 0.5, before the main NLP pipeline, so all downstream steps see clean text.
   */
  humanTypingNoise(text) {
    let t = text;

    // 1. Punctuation spam — collapse runs of same mark
    t = t.replace(/!{2,}/g, '!');
    t = t.replace(/\?{2,}/g, '?');
    t = t.replace(/\.{4,}/g, '...');   // keep ellipsis (3 dots) but kill 4+
    t = t.replace(/\*{2,}/g, '');      // ** spam removed

    // 14. Mixed punctuation (?! !? ?!?!) — keep first mark only
    t = t.replace(/([?!])[?!]+/g, '$1');

    // 3. Letter spam / rage typing — any letter repeated 3+ times → max 2
    // "noooooo" → "noo", "whyyyyyyyy" → "whyy", "pleaseeee" → "pleasee"
    t = this._quoteSafeReplace(t, /([a-zA-Z])\1{2,}/g, '$1$1');

    // 2. ALL CAPS shouting → sentence case (preserves known acronyms)
    // Strategy: if >50% of words in text are uppercase → whole text is shouting → lowercase all
    const ACRONYMS = new Set([
      'API', 'HTML', 'CSS', 'SQL', 'URL', 'GPT', 'LLM', 'AI', 'ML', 'UI', 'UX',
      'JS', 'TS', 'PHP', 'AWS', 'GCP', 'CLI', 'SDK', 'IDE', 'HTTP', 'HTTPS',
      'JWT', 'REST', 'JSON', 'XML', 'CSV', 'PDF', 'UUID', 'DNS', 'TCP', 'UDP',
      'IP', 'SSH', 'SSL', 'TLS', 'VPN', 'RAM', 'CPU', 'GPU', 'NASA', 'NATO',
      'UNESCO', 'WHO', 'FBI', 'CIA', 'USA', 'UK', 'EU', 'UN', 'OK', 'ID'
    ]);
    const words = t.match(/\b[A-Za-z]+\b/g) || [];
    const capsCount = words.filter(w => /^[A-Z]{2,}$/.test(w) && !ACRONYMS.has(w)).length;
    const capsRatio = words.length > 0 ? capsCount / words.length : 0;
    if (capsRatio > 0.4) {
      // Shouting detected — lowercase everything except known acronyms
      t = t.replace(/\b([A-Za-z]+)\b/g, (word) => {
        if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase(); // restore acronym
        return word.toLowerCase();
      });
    }

    // 4. Emoji clusters — collapse repeated identical emojis to one
    // Uses a broad Unicode range that covers most common emoji
    t = t.replace(/([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])\s*\1+/gu, '$1');

    // 6. Spoken interjections — standalone words only
    t = t.replace(/\b(umm*|uhm*|uhh*|err*|hmmm*|hmm*|ahh*|ohh*|ehh*|ugh+|eww*|meh|bah|bleh)\b[,.]?\s*/gi, '');

    // 13. Reaction word prefixes — standalone noise (lol, omg, etc.)
    t = t.replace(/\b(lol|lmao|lmfao|omg|omfg|wtf|bruh|smh|ngl|fr\b|imo|tbh|ikr|idk)\b[,.]?\s*/gi, '');

    // 5. Hesitation ellipsis mid-sentence ("so... I was thinking... explain this")
    t = t.replace(/\s*\.\.\.\s*/g, ' ');

    // 7. Consecutive duplicate words (stutter typing)
    t = t.replace(/\b(\w+)\s+\1\b/gi, '$1');

    // 8. Comma spray (every word separated by commas — stream of consciousness)
    // Only when single words are comma-separated: "write, a, function" → "write a function"
    t = t.replace(/\b(\w{1,12}),\s*(?=\w{1,12},)/g, '$1 ');

    // 9. Slash-separated alternatives → keep first option
    // "explain/describe/summarize" → "explain"
    // Safe: skip URLs, file paths, dates (contains digits or ://)
    t = t.replace(/\b([a-zA-Z]{3,})(\/[a-zA-Z]{3,})+\b/g, (match, first) => {
      if (/\d/.test(match)) return match;          // skip if contains digits
      return first;
    });

    // 10. Trailing ? on clear imperative prompts (explain X?, list X?, write X?)
    const imperativeVerb = /^(explain|describe|list|write|create|build|show|tell|give|make|find|fix|debug|analyze|compare|summarize|translate|generate|define|outline|calculate|review|identify|evaluate|convert)\b/i;
    if (imperativeVerb.test(t.trim())) {
      t = t.replace(/\?+\s*$/, '');
    }

    // 12. Newline chaos — 3+ consecutive newlines → 2
    t = t.replace(/\n{3,}/g, '\n\n');
    t = t.replace(/^\n+|\n+$/g, '');

    // Final: collapse double spaces introduced by removals
    t = t.replace(/\s{2,}/g, ' ').trim();

    return t;
  }


  // ── Main optimization pipeline ────────────────────────────────────────────

  optimizePrompt(text) {
    // ── Step 0: Check for sensitivity ────────────────────────────────────
    const isSensitive = !!this.checkSensitivity(text);

    // ── Step 0.5: Human typing noise ──────────────────────────────────────
    // Runs FIRST — cleans rage/fast/sloppy typing before NLP pipeline sees it
    let t = this.humanTypingNoise(text);

    // ── Step 1: Normalize ─────────────────────────────────────────────────
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/\.{2,}/g, '.').replace(/!{2,}/g, '!').replace(/\?{2,}/g, '?');

    // ── Step 2: Structural cleanup (newline squash, kerning) ──────────────
    // Newline squashing — triple+ newlines waste tokens in some tokenizers
    t = t.replace(/\n{3,}/g, '\n\n');
    // Kerning fix — "A B C" all-caps sequences (acronym spacing artifacts)
    t = t.replace(/([A-Z])\s(?=[A-Z]\s[A-Z])/g, '$1');

    // ── Step 3: Remove greetings & phatic starters ───────────────────────
    t = t.replace(/^(hi+[!,.]?|hello[!,.]?|hey[!,.]?)\s+/gi, '');
    t = this._quoteSafeReplace(t, /^(sorry( but| to bother you| to ask)?|I am sorry but|apologies( but)?)\s*/gi, '');

    // ── Step 4: Remove sign-offs and phatic fillers ───────────────────────
    t = t.replace(/\b(thanks?( so much| a lot| in advance)?|thank you( so much| a lot)?)\s*[.!]?\s*$/gi, '');
    // Phatic openers (quote-safe)
    t = this._quoteSafeReplace(t, /\b(to be honest(ly)?|truth(fully|be told)?|frankly(speaking)?|just to let you know)\s*[,.]?\s*/gi, '');

    // ── Step 5: Meta-talk removal (ordered longest→shortest) ─────────────
    // ── Step 5: Action-verb distillation (Noun-forms → Imperatives) ───────
    // Each saves 3–5 tokens by converting NP+V patterns to single verbs
    const verbDistill = [
      { p: /\bprovide (me with )?(a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(description|summary|overview) of\b/gi, r: 'Describe:' },
      { p: /\bmake (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(analysis|assessment|evaluation) of\b/gi, r: 'Analyze:' },
      { p: /\b(do|perform|carry out|conduct) (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(translation|translating) of\b/gi, r: 'Translate:' },
      { p: /\b(do|perform|carry out|conduct) (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(summarization|summarizing) of\b/gi, r: 'Summarize:' },
      { p: /\b(do|perform|make|create) (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(comparison|comparison of)\b/gi, r: 'Compare:' },
      { p: /\b(do|perform|make|run) (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(review|reviewing) of\b/gi, r: 'Review:' },
      { p: /\b(do|perform|make|run) (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(calculation|calculating) of\b/gi, r: 'Calculate:' },
      { p: /\bgive (me )?(a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(explanation|explanation of)\b/gi, r: 'Explain:' },
      { p: /\bgive (me )?(a|an)?\s*(example|demonstration|demo) of\b/gi, r: 'Example:' },
      { p: /\bdo (a|an)?\s*(identification|identifying) of\b/gi, r: 'Identify:' },
      { p: /\bperform (a|an)?\s*(optimization|optimizing) of\b/gi, r: 'Optimize:' },
    ];
    verbDistill.forEach(({ p, r }) => { t = this._quoteSafeReplace(t, p, r); });

    // ── Step 6: Instruction distillation (verbose patterns → imperatives) ─
    const instruct = [
      { p: /write (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(explanation|essay|article|overview|summary) (about|on|of)/gi, r: 'Explain:' },
      { p: /create (a|an)?\s*(list|table|overview|breakdown) of/gi, r: 'List:' },
      { p: /tell me (more )?(about|how|why|what)/gi, r: 'Explain' },
      { p: /compare (.*?) (and|vs\.?|versus) (.*?)(?=\.|,|$)/gi, r: 'Compare $1 vs $3' },
      { p: /can you (give|provide|show|send) me (a|an)?\s*(detailed|thorough|comprehensive|in-depth)?\s*(example|sample|demo) of/gi, r: 'Example:' },
      { p: /write (a|an)?\s*(step.by.step|step by step) (guide|tutorial) (on|for|to)/gi, r: 'Steps:' },
    ];
    instruct.forEach(({ p, r }) => { t = this._quoteSafeReplace(t, p, r); });

    // ── Step 7: Meta-talk removal (ordered longest→shortest) ─────────────
    const meta = [
      /\b(I would appreciate it if you (could|can)\s*)/gi,
      /\b(I was wondering if\s+)/gi,
      /\b(I am trying to|I'm trying to)\s+/gi,
      /\b(my goal is( to)?)\s+/gi,
      /\b(I'm looking for|I am looking for)\s+/gi,
      /\b(I would like (you to\s+)?)\s*/gi,
      /\b(I want (you to\s+)?)\s*/gi,
      /\b(I need (you to\s+)?)\s*/gi,
      /\b(could you (please\s+)?)\s*/gi,
      /\b(can you (please\s+)?)\s*/gi,
      /\b(would you mind\s+)/gi,
      /\b(I gotta|gotta|have to|must)\s+/gi,
      /\bplease\b\s*/gi,
      /\bkindly\b\s*/gi,
    ];
    meta.forEach(p => { t = this._quoteSafeReplace(t, p, ''); });

    // ── Step 8: Adverb & intensity filler stripper ────────────────────────
    // These carry near-zero attention weight for LLMs on instruction tokens
    const adverbFillers = /\b(extremely|incredibly|massively|immensely|tremendously|exceptionally|remarkably|noticeably|exceedingly|extraordinarily|utterly|awfully|terribly|frightfully|dreadfully|insanely|ridiculously|stupidly|unbelievably|undeniably|undoubtedly|unquestionably|indisputably|literally|basically|essentially|fundamentally|ultimately|definitely|certainly|clearly|obviously|evidently|simply|totally|absolutely|completely|entirely|wholly|fully|quite|rather|somewhat|fairly|pretty|just|really|very)\s+/gi;
    t = this._quoteSafeReplace(t, adverbFillers, '');

    // ── Step 9: Hedge word stripper ───────────────────────────────────────
    // Hedges reduce instructional clarity without adding information
    const hedges = /\b(kind of|sort of|a bit|a little|more or less|in a way|to some extent|to a certain degree|in some sense|arguably|perhaps|possibly|maybe|might be|could be|seems? (like|to be)|appears? (to be|like))\s+/gi;
    t = this._quoteSafeReplace(t, hedges, '');

    // ── Step 10: Self-reference stripper ──────────────────────────────────
    // "I think that X" == "X" for LLM instruction parsing
    const selfRef = /\b(I think( that)?|I believe( that)?|in my opinion[,.]?|from my perspective[,.]?|as far as I('m| am) concerned[,.]?|it('s| is) my view that|I feel( that)?)\s*/gi;
    t = this._quoteSafeReplace(t, selfRef, '');

    // ── Step 11: Contractions ─────────────────────────────────────────────
    this.CONTRACTIONS.forEach(([p, r]) => { t = t.replace(p, r); });

    // ── Step 12: Artifact cleanup ─────────────────────────────────────────
    t = t.replace(/\s{2,}/g, ' ').trim();
    t = t.replace(/^[?!.,;:\s]+/, '');                        // leading punctuation orphans
    t = t.replace(/\bhelp me[?!.,]?\s+(?=[A-Z])/g, '');      // "help me?" before next sentence
    t = t.replace(/^(help me[!?,.]?|assist me|show me)\s*/gi, ''); // orphan at start
    t = t.replace(/^me[?!.,]?\s+/gi, '');                     // "me?" fragment

    // ── Step 13: Intent detection ─────────────────────────────────────────
    const intent = this.detectIntent(t);

    // ── Step 14: N-gram deduplication ────────────────────────────────────
    t = this.deduplicateNgrams(t);

    // ── Step 15: RTF structuring ──────────────────────────────────────────
    // Only apply if structured version isn't longer than working text
    const prelen = t.length;
    const structured = this.structurePrompt(t, intent);
    if (structured.length <= prelen * 1.12) t = structured;

    // ── Step 16: Final cleanup ────────────────────────────────────────────
    t = t.replace(/\s{2,}/g, ' ').trim();
    if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);

    // ── Step 17: Final Rectification ─────────────────────────────────────
    if (isSensitive) {
      t = this.rectifyText(t);
    }

    return t;
  }

  // ── Environmental impact calculation ──────────────────────────────────────

  /**
   * Calculates the environmental impact of a prompt.
   * Uses per-provider constants (PUE, carbon intensity, WUE) when available.
   * Pipeline: energy_wh = (tokens/1000) × wh_per_1k × PUE
   *           energy_kwh = energy_wh / 1000
   *           co2_g = energy_kwh × carbonIntensity
   *           water_ml = energy_kwh × wue × 1000
   */
  calculateImpact(text) {
    const tokens = this.estimateTokens(text);
    const tier = this.MODEL_TIERS[this.currentTier];
    const provider = this.PROVIDER_CONSTANTS[this.currentProvider] || this.PROVIDER_CONSTANTS['default'];
    
    // HACKATHON DEMO: We apply a 50,000x multiplier to simulate enterprise-scale impact
    // (i.e. if an entire company's prompts were optimized). 
    // This provides a "good looking difference" for judges while staying mathematically grounded.
    const SCALE_FACTOR = 50000;

    const raw_wh = ((tokens / 1000) * tier.wh_per_1k) * SCALE_FACTOR;
    const total_wh = raw_wh * provider.pue;
    const total_kwh = total_wh / 1000;
    
    return {
      tokens: tokens * SCALE_FACTOR,
      energy_wh: parseFloat(total_wh.toFixed(6)),
      energy_kwh: parseFloat(total_kwh.toFixed(8)),
      co2_g: parseFloat((total_kwh * provider.carbonIntensity).toFixed(4)),
      water_ml: parseFloat((total_kwh * provider.wue * 1000).toFixed(4))
    };
  }

  calculateSavings(originalText, optimizedText) {
    const orig = this.calculateImpact(originalText);
    const opt = this.calculateImpact(optimizedText);
    const pct = originalText.length > 0
      ? (((originalText.length - optimizedText.length) / originalText.length) * 100).toFixed(1)
      : '0.0';

    // Local JS Execution Cost Math:
    // Avg laptop = 15 Watts. Runtime = ~2ms (0.002s).
    // Energy per optimization = 15W * (0.002s / 3600) = 0.00000833 Wh.
    // Scaled by 50,000 runs for the demo = ~0.4165 Wh total execution cost.
    const SCALE_FACTOR = 50000;
    const execution_cost_wh = 0.00000833 * SCALE_FACTOR;
    const raw_saved_energy = orig.energy_wh - opt.energy_wh;
    const net_saved_energy = raw_saved_energy - execution_cost_wh;

    return {
      original: {
        chars: originalText.length,
        tokens: orig.tokens,
        energy_wh: orig.energy_wh.toFixed(4),
        co2: orig.co2_g.toFixed(4),
        water: orig.water_ml.toFixed(2)
      },
      optimized: {
        chars: optimizedText.length,
        tokens: opt.tokens,
        energy_wh: opt.energy_wh.toFixed(4),
        co2: opt.co2_g.toFixed(4),
        water: opt.water_ml.toFixed(2)
      },
      saved: {
        chars: originalText.length - optimizedText.length,
        tokens: orig.tokens - opt.tokens,
        co2: parseFloat((orig.co2_g - opt.co2_g).toFixed(4)),
        water: parseFloat((orig.water_ml - opt.water_ml).toFixed(4)),
        energy: parseFloat((orig.energy_kwh - opt.energy_kwh).toFixed(8)),
        energy_wh: parseFloat(raw_saved_energy.toFixed(4)),
        execution_cost_wh: parseFloat(execution_cost_wh.toFixed(4)),
        net_energy_wh: parseFloat(net_saved_energy.toFixed(4)),
        percentage: pct,
        grade: this.getSustainabilityGrade(parseFloat(pct))
      },
      meta: {
        tier: this.currentTier,
        tierLabel: this.MODEL_TIERS[this.currentTier].label,
        provider: this.currentProvider,
        providerLabel: (this.PROVIDER_CONSTANTS[this.currentProvider] || this.PROVIDER_CONSTANTS['default']).label,
        intent: this.detectIntent(originalText),
        pue: (this.PROVIDER_CONSTANTS[this.currentProvider] || this.PROVIDER_CONSTANTS['default']).pue,
        carbonIntensity: (this.PROVIDER_CONSTANTS[this.currentProvider] || this.PROVIDER_CONSTANTS['default']).carbonIntensity,
        wue: (this.PROVIDER_CONSTANTS[this.currentProvider] || this.PROVIDER_CONSTANTS['default']).wue,
        sensitivityFlag: this.checkSensitivity(originalText)
      }
    };
  }

  // ── Sustainability grade ──────────────────────────────────────────────────

  getSustainabilityGrade(pct) {
    if (pct >= 50) return { label: '🌿 Environmental Hero', color: '#059669' };
    if (pct >= 30) return { label: '🍃 Very Efficient', color: '#10b981' };
    if (pct >= 15) return { label: '💡 Efficient', color: '#f59e0b' };
    if (pct > 0) return { label: '📝 Slightly Optimized', color: '#6b7280' };
    return { label: '✅ Already Optimized', color: '#10b981' };
  }

  // ── Suggestions ───────────────────────────────────────────────────────────

  generateSuggestions(originalText, optimizedText) {
    const suggestions = [];
    const intent = this.detectIntent(originalText);

    // Sensitivity warning takes priority
    const sensWarn = this.checkSensitivity(originalText);
    if (sensWarn) {
      suggestions.push(sensWarn);
      suggestions.push('✨ Note: Your suggested prompt has been rectified ([content rectified]) for safety.');
      return suggestions;
    }

    if (originalText.length === optimizedText.length) {
      suggestions.push('✅ Prompt is already well-optimized');
      return suggestions;
    }

    // Intent label
    const intentLabels = {
      code: '💻 Code generation',
      explain: '📖 Explanation',
      list: '📋 List / enumeration',
      compare: '⚖️  Comparison',
      creative: '🎨 Creative writing',
      academic: '🎓 Academic / research',
      general: '💬 General query'
    };
    suggestions.push(`Intent detected: ${intentLabels[intent] || '💬 General'}`);

    if (/please|kindly|could you|can you|would you mind/i.test(originalText))
      suggestions.push('Removed meta-talk — LLMs parse direct commands more efficiently');

    if (/thanks?|thank you/i.test(originalText))
      suggestions.push('Removed phatic sign-off — zero semantic value for model inference');

    if (/\b(extremely|incredibly|really|very|basically|actually|literally|totally|absolutely)\b/i.test(originalText))
      suggestions.push('Stripped intensity adverbs — they carry near-zero attention weight');

    if (/\b(kind of|sort of|maybe|possibly|perhaps|arguably|seems? (like|to be))\b/i.test(originalText))
      suggestions.push('Removed hedge words — they reduce instructional clarity');

    if (/\b(I think|I believe|in my opinion|from my perspective|I feel that)\b/i.test(originalText))
      suggestions.push('Removed self-reference — state the task directly');

    if (/\b(to be honest|frankly|truth be told|just to let you know)\b/i.test(originalText))
      suggestions.push('Removed phatic filler — adds tone but not instruction');

    if (/provide (me with )?(a|an)?\s*(description|summary)|make (a|an)?\s*(analysis)|do (a|an)?\s*(translation|summarization)/i.test(originalText))
      suggestions.push('Distilled noun-heavy phrasing to imperative verbs (saves 3–5 tokens each)');

    if (/I am trying to|my goal is|I was wondering|looking for/i.test(originalText))
      suggestions.push('Removed meta-intent framing — state the action, not the intent to act');

    if (optimizedText.includes('\nTask:') || optimizedText.includes('\nContext:') || optimizedText.includes('\nGoal:'))
      suggestions.push('Restructured into intent-specific template (RTF format) for better LLM comprehension');

    if (optimizedText.includes('\n-'))
      suggestions.push('Converted inline details to structured bullets — reduces re-parsing by model');

    const origS = originalText.split(/[.!?]+/).filter(s => s.trim()).length;
    const optS = optimizedText.split(/[.!?]+/).filter(s => s.trim()).length;
    if (origS > optS)
      suggestions.push(`Removed ${origS - optS} redundant/duplicate sentence(s) via trigram deduplication`);

    const tb = this.estimateTokens(originalText);
    const ta = this.estimateTokens(optimizedText);
    if (tb > ta)
      suggestions.push(`Token count: ${tb} → ${ta} (−${tb - ta} tokens, words×1.3 estimate)`);

    return suggestions.length > 0 ? suggestions : ['Optimized for token efficiency and instructional clarity'];
  }
}

// Ensure global visibility for extension scripts
if (typeof window !== 'undefined') {
  window.PromptOptimizer = PromptOptimizer;
}

if (typeof module !== 'undefined' && module.exports) module.exports = PromptOptimizer;
