/* coherent-welcome: agent-v1 — Coherent's starter page. Content is fixed; the look is the agent's to design. */
const prompts = [
  [
    'Restyle this page in your own style',
    'Your agent designs this page from scratch, keeping the text. Every run looks different.',
  ],
  [
    'Build a marketplace where brands hire creators: who it is for, the main screens, the feel',
    'Describe the product; the agent designs and builds the whole app.',
  ],
  ['Make the accent warmer', 'A token change: every page follows.'],
  ['Only on Billing, move the transactions table up', 'One page changes; every other page must stay pixel-identical.'],
  [
    'Add a payouts chart to Earnings',
    'Reuses an existing component when one fits its purpose, or creates a shared one.',
  ],
  ['Undo that', 'Restores exactly the files of that change, byte for byte.'],
]

const steps = [
  [
    'Scope',
    'Tokens, one shared component, a variant for some pages, one page, or a new component: the narrowest one that does the job.',
  ],
  ['Impact', 'Before writing, you see what the change touches: "affects 3 of 13 pages".'],
  ['Transaction', 'Only the declared files may change. Anything else fails the edit.'],
  [
    'Verification',
    'TypeScript, a production build, renders of affected pages and controls, no new browser errors, no real names or emails in the UI.',
  ],
  ['Verdict', 'verified, partially verified (and why), or failed and rolled back. Never a silent pass.'],
]

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header>
        <p>Coherent</p>
        <h1>Describe your product. Your agent builds it. Coherent keeps it coherent.</h1>
        <p>
          This app is set up for agent mode. You talk to your coding agent in plain language; it designs and writes the
          code with full freedom of taste. Coherent shows what each change touches, holds it in a transaction, verifies
          it landed where intended and nowhere else, and lets you undo it.
        </p>
      </header>

      <section>
        <h2>Start here</h2>
        <p>Open this folder in Claude Code (CLI or desktop). The Coherent agent is the project default. Then try:</p>
        <ul>
          {prompts.map(([prompt, what]) => (
            <li key={prompt}>
              <strong>&ldquo;{prompt}&rdquo;</strong>
              <span> {what}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>What happens on every change</h2>
        <ol>
          {steps.map(([name, what]) => (
            <li key={name}>
              <strong>{name}.</strong> {what}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Other agents</h2>
        <p>
          Codex: <code>codex mcp add coherent -- npx --no-install coherent mcp --profile agent</code>. Instructions for
          Codex and other agents are in <code>AGENTS.md</code>. Changes made outside Coherent are detected and offered
          for verification.
        </p>
      </section>

      <footer>
        <p>
          Coherent is open source: <a href="https://getcoherent.design">getcoherent.design</a>
        </p>
      </footer>
    </main>
  )
}
