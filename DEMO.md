# 🌿 GreenPrompt: Presenter's Demo Manual

Welcome to the GreenPrompt demo guide! This manual is structured to help you present your project flawlessly to the judges, highlighting both the **Browser Extension** (for everyday users) and the **Playground** (for power users).

---

## 🛠️ Step 0: Pre-Flight Check (Before Judges Arrive)

1.  **Start the Backend Server:**
    *   Open your terminal, navigate to the `backend/` folder.
    *   Run: `uvicorn main:app --reload --port 8000`
    *   *Confirm the terminal says "✅ GreenPrompt API ready — all keys loaded."*
2.  **Load the Extension:**
    *   Go to `chrome://extensions/` in Chrome.
    *   Ensure **Developer Mode** is ON in the top right.
    *   Click **Load Unpacked**, select the `extension/` folder, and pin the GreenPrompt leaf icon 🌿 to your toolbar.
3.  **Open the Playground:**
    *   Open your `playground/index.html` file in a new browser tab.
4.  **Open ChatGPT/Claude/Gemini:**
    *   Open a tab with ChatGPT ready to type a prompt.

---

## 🎬 Act 1: The Browser Extension (The Everyday Solution)

**Your Narrative:** *"Every day, millions of people use massive, energy-hungry models for simple tasks. We built a browser extension to intercept this wasteful behavior right where it happens."*

1.  **Go to ChatGPT** and paste a deliberately wordy, inefficient prompt.
    > *"Can you please write me a very long and detailed list of all the different planets that exist inside of our solar system?"*
2.  **Show the Live Badge:** Point out the green leaf token counter injecting live stats into the corner of the text box.
3.  **Click "Optimize":** Click the GreenPrompt **Optimize** button that your extension injected into the UI.
4.  **Explain the Magic:** Show the judges how the prompt was instantly rewritten to be shorter and more precise via *local NLP* (saving tokens before they even hit the cloud).
5.  **Open the Popup:** Click the extension icon in your Chrome toolbar. Show the **Impact Dashboard** reflecting the total tokens saved, and point out the "Open Playground 🌐" button.

---

## 🎬 Act 2: The GreenPrompt Playground (The Engine Room)

**Your Narrative:** *"But what if developers want to automatically route prompts to the most energy-efficient model? That’s where our Playground and Classification Engine come in."*

*(Click the "Open Playground" button in your extension to smoothly transition to your `index.html` tab).*

### 🟢 The SLM Demo (Simple Task)
*   **Paste:** *"What is the capital of France, and when was the Eiffel Tower built?"*
*   **Highlight to Judges:**
    *   The engine badge top-left says **RULE ENGINE**. No API was called. Zero latency, zero cost.
    *   The **Green Score** is an **A**.
    *   The model selected is `Llama 3.1 8B` (SLM).
    *   Show the **Savings Callout** ("Saves 90% energy compared to FULL tier").
*   **Click "Run":** Show the fast typewriter response.

### 🔴 The FULL Demo (Heavy Logic)
*   **Paste:** *"Design a secure Python backend API using FastAPI. Implement a secure login endpoint, evaluate the best hashing algorithm to use, and finally prove why it is cryptographically safer than MD5."*
*   **Highlight to Judges:**
    *   The system instantly caught the heavy analytical verbs (`Design`, `evaluate`, `prove`) and coding context.
    *   The **Green Score** correctly drops, routing to the heavy `Gemma 2 9B`.
*   **Click "Run":** Show the beautiful Markdown rendering of the complex response.

### 🟡 The MID Demo & Alternative Suggestions
*   **Paste:** *"Write a two-paragraph summary explaining the economic benefits of renewable energy. Please specifically mention solar and wind infrastructure."*
*   **Highlight to Judges:**
    *   Routed to the MID tier (`Mixtral 8x7B`).
    *   **Crucial Point:** Point out the **"Also suitable"** chip row beneath the savings.
    *   *Tell the judges:* "We don't just abstract the choice; we educate the user on sustainable model alternatives like Claude Haiku or GPT-4o mini so they learn better habits."

---

## 🎬 Act 3: Edge Cases & Reliability (The "Wow" Factor)

**Your Narrative:** *"A core requirement of sustainability is reliability. If our local classifier fails to understand a strange prompt, we have a safety net."*

1.  **The "Ambiguous" Prompt Demo (Gemini Flash Fallback):**
    *   Type something bizarre that breaks simple rules: *"I need to build a thing that does the thing with the data."*
    *   **Highlight:** Point out the badge switching from green **RULE ENGINE** to gold **GEMINI FLASH**.
    *   **Explain:** *"Our local engine wasn't sure, so it fell back to a hyper-fast, low-energy Gemini Flash API call to make the routing decision for us."*
2.  **Error Handling (Optional Flex):**
    *   Stop the backend server in your terminal (`Ctrl+C`).
    *   Type a prompt and hit Enter.
    *   **Highlight:** Show the elegant red error card appearing in the chat UI telling the user precisely how to restart their backend, preventing a broken UX.

---

### 🎉 Closing Statement
*"With GreenPrompt, we've built a two-pronged approach to sustainable AI: a browser extension that tackles passive token waste, and a playground router that actively matches prompt complexity to the precise amount of compute required. Thank you."*
