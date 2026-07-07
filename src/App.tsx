import { SITE } from './content/meta'

export default function App() {
  return (
    <main className="hold">
      <img className="pfp" src="https://github.com/DamianLHr.png" alt="" width={96} height={96} />
      <h1>{SITE.name}</h1>
      <p className="tagline">{SITE.tagline}</p>
      <p className="status">under construction — the interesting part is on its way</p>
      <nav>
        <a href={SITE.github}>GitHub</a>
        <a href={SITE.itch}>itch.io</a>
      </nav>
    </main>
  )
}
