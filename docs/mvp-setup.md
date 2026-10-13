# Gain MVP: set up and first walk

This gets you from zero to talking with Gain on a walk. Setup takes about 45 minutes, mostly downloads.

**How it works:** your PC runs everything: the architect (a local AI model), the coding agents and your projects.
Your iPhone is just a microphone and earphones for it. Tailscale connects the phone to the PC securely from anywhere,
for free. Nothing costs money except the Wispr Flow subscription you already have.

```
iPhone (Wispr Flow → Gain app → AirPods)  ──Tailscale──▶  Windows PC: Gain server ─▶ Ollama (architect model)
                                                                          └──────▶ Aider (coding agent) ─▶ git branch per task
```

---

## Part 1 — the PC (Windows 11)

Open **PowerShell** for the commands below (Start menu → type "PowerShell").

### 1. Install the tools

| What | Where | Check it worked |
|---|---|---|
| Node.js **24 LTS** | https://nodejs.org → "LTS" installer | `node --version` shows v24 or newer (v22.18+ also works) |
| Git for Windows | https://git-scm.com/download/win (defaults are fine) | `git --version` |
| Ollama | https://ollama.com/download/windows | the llama icon appears in the tray |
| Tailscale | https://tailscale.com/download/windows → sign in | the Tailscale icon appears in the tray |

Close and reopen PowerShell after installing, so it sees the new commands.

### 2. Download the AI models (about 10 GB)

```powershell
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
```

`qwen3:8b` is the architect you talk to. It speaks Russian and English. `qwen2.5-coder:7b` is the coding agent's model.
Your RTX 2060 SUPER has 8 GB, and the two models don't fit in it together. When an agent is working, Ollama swaps
models, so expect a few seconds of extra delay on replies during agent work.

### 3. Install Aider (the coding agent)

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://aider.chat/install.ps1 | iex"
```

Then close and reopen PowerShell and check: `aider --version`.

### 4. Get Gain

```powershell
cd $HOME
git clone https://github.com/MrCEO667/gain.git
cd gain
git checkout claude/gain-project-kickoff-v0a8do
git config user.name "Your Name"
git config user.email "you@example.com"
```

(Once this branch is merged, skip the `git checkout` line.)

Gain works with no config file: it talks with `qwen3:8b`, and agents work on Gain's own code. To add your other
projects, copy `gain.config.example.json` to `gain.config.json` and edit the `projects` list.
Each project must be a git repository with at least one commit.

### 5. Start Gain

Double-click **`start-gain.cmd`** in the `gain` folder (or run `npm start`). A window opens and prints:

```
Gain 0.1.0 is running.
  On this computer:  http://127.0.0.1:8787/?token=AbC123...
```

**Keep this window open** while you walk. Lines starting with `!` are warnings that tell you what's missing.
Open the "On this computer" link in a browser on the PC and type a message to check that everything works.

### 6. Make the PC reachable from your phone

1. Open https://login.tailscale.com/admin/machines, click your PC → **Edit machine name** → name it `gain`.
   (Machine names become public in certificate logs, so use a neutral name.)
2. Open https://login.tailscale.com/admin/dns → make sure **MagicDNS** is on → under **HTTPS Certificates** click **Enable**.
3. In PowerShell:
   ```powershell
   tailscale serve --bg 8787
   ```
   It prints your address, something like `https://gain.tail1234.ts.net`. This keeps working after reboots.

### 7. Stop the PC from sleeping

Settings → System → Power → **Screen and sleep** → "When plugged in, put my device to sleep after" → **Never**.
If the PC sleeps, Gain is unreachable during your walk.

---

## Part 2 — the iPhone

1. Install **Tailscale** from the App Store and sign in with the **same account** as on the PC. Turn it on.
2. In Safari, open your address with the token from the PC window:
   `https://gain.tail1234.ts.net/?token=AbC123...`
   (Tip: send the link to yourself from the PC through Telegram or Notes, so you don't have to retype the token.)
3. Tap **Share → Add to Home Screen → Add**. From now on, open Gain from the Home Screen icon.
4. Make sure the **Wispr Flow keyboard** is enabled: Settings → General → Keyboard → Keyboards → Flow, with Full Access on.
5. Optional, for a much nicer voice: Settings → Accessibility → Spoken Content → Voices → English (and Russian) →
   download an **Enhanced** or **Premium** voice. Then pick it in Gain → Settings.

**Test before you leave:** turn Wi-Fi off on the phone and send a message over cellular. If it works, it will work outside.

---

## Part 3 — the walk

1. AirPods in. Open Gain from the Home Screen → **Start walk**. You hear "Ready."
2. Tap the text box, switch to the **Flow** keyboard, tap its mic and talk. When you stop, Wispr Flow types your words,
   and Gain sends them after a 2-second pause (the blue line shows the countdown). To send immediately, end with
   **"over"** or **"send it"**.
3. The architect answers in your AirPods. It pushes back and asks one question at a time. That's on purpose.
4. When it proposes a task, you hear "Task ready… Say go to start it." Say **"go"** and an agent starts working on the
   PC. When the task finishes, you hear the result.
5. After 15 seconds without touching the screen, the **pocket guard** turns the screen black so pocket touches do
   nothing. **Hold** the screen for half a second to talk again.

The screen stays on while Gain is open (iPhone stops speech when the phone locks). The pocket guard keeps it black.

### Voice commands

Commands work when you say only the command. "Go" alone starts a task; "go to the park" is normal conversation.

| Say | What happens |
|---|---|
| *anything* | Normal conversation with the architect |
| **"just listen"** / «просто слушай» | The architect stays quiet and only says "mm-hm" while you think aloud |
| **"your turn"** / «твоя очередь» | It sums up what you said and gives its strongest objection |
| **"go"** / «давай», «запускай» | Starts the proposed task |
| **"cancel"** / «отмена» | Drops the proposed task |
| **"task: …"** / «задача: …» | Starts an agent right away with your words as the instructions |
| **"task for myapp: …"** | Same, in another project from your config |
| **"remember that …"** / «запомни …» | Saves a fact to long-term memory (`data/memory.md`) |
| **"status"** / «статус» | What the agents are doing |
| **"wrap up"** / «подведи итоги» | Writes the meeting minutes and reads you the summary |
| **"stop all"** / «стоп всё» | Stops every agent immediately (same as the red button) |

---

## Part 4 — back at the desk

Open the **Brief** tab (on the phone, or at `http://127.0.0.1:8787/?token=…` on the PC). It shows:

- **Needs your decision:** proposed tasks you didn't start, failed tasks, failed checks.
- **Ready to review:** each finished task with its branch, commits, and copy-paste commands to see the diff and merge.
- **Conversations:** minutes of your recent walks.

Agents never touch your main checkout. Each task works in its own folder (`data/worktrees/…`) on its own branch
(`gain/t3-…`). Nothing reaches your real code until **you** run the merge command at your desk.

**Improving Gain by talking to it:** project `gain` is Gain itself. After you merge a task into Gain, close the Gain
window and start `start-gain.cmd` again to run the new version.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Red dot in the app | The phone can't reach the PC: is Tailscale on (on the phone *and* the PC)? Is the PC awake? Is the Gain window open? |
| "Access token missing or wrong" | Open the full link with `?token=` from the PC window again, or paste the token in Settings |
| "I cannot reach the model" | Start Ollama (tray icon). Check `ollama list` shows `qwen3:8b` |
| Replies are slow | The first reply after a while loads the model (10–30 s). Replies during agent work are slower because models swap on the GPU |
| No sound | Did you tap **Start walk**? Is "Speak replies" on in Settings? Is the phone muted? |
| Speech stops in the pocket | The phone locked. Keep "Keep the screen on" enabled and leave Gain open |
| Task failed: "aider was not found" | Install Aider (Part 1, step 3), then restart Gain |
| Messages sent with no signal | They wait in an offline queue on the phone and go out when the connection is back |

## Changing the brain

Everything is in `gain.config.json` (copy it from `gain.config.example.json`):

- **Another local model:** `"llm": { "model": "..." }` after you run `ollama pull ...`.
- **A cloud model** if local is too slow: `"provider": "openai"`, `"baseUrl"` of any OpenAI-compatible service, `"apiKey"`, `"model"`.
- **Another coding agent:** change `"agent": { "command": [...] }`. Placeholders: `{promptFile}` (a file with the task,
  the safest choice on Windows), `{prompt}`, `{title}`, `{worktree}`. Set `"stdinPrompt": true` for agents that read the task from input.

Gain's data (conversation, memory, minutes, tasks, logs, token) lives in the `data/` folder, and you can read or edit all of it.
