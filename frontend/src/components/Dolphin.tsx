export function Dolphin() {
  return (
    <svg className="dolphin" viewBox="0 0 160 110" role="img" aria-label="Fin, a friendly dolphin mascot">
      <ellipse className="dolphin-shadow" cx="79" cy="96" rx="43" ry="5" fill="currentColor" opacity=".1" />
      <g className="dolphin-body">
        <g className="dolphin-tail">
          <path d="M43 64C30 61 18 47 10 51c3 12 13 20 25 21C24 75 20 86 24 93c13-1 22-12 23-23Z" fill="#339ba9" stroke="#125268" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <path d="M40 66c9-22 28-34 52-34l-5-17c14 3 23 10 25 21 14 5 22 15 23 26l16 4c4 2 3 7-2 8l-22 1c-21 14-60 14-87-9Z" fill="#69cad0" stroke="#125268" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M47 69c26 6 52 4 78-2-15 16-49 20-78 2Z" fill="#d9f6ec" />
        <path d="M81 69c-1 12 6 20 18 21l-3-23" fill="#339ba9" stroke="#125268" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="118" cy="54" r="4" fill="#125268" />
        <circle cx="119" cy="53" r="1.3" fill="#fff" />
        <path d="M125 66q7 6 14 2" fill="none" stroke="#125268" strokeWidth="2" strokeLinecap="round" />
        <path d="M65 45q11-6 20-5" fill="none" stroke="#b6eeeb" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g fill="none" stroke="#69cad0" strokeWidth="2" opacity=".6"><circle cx="143" cy="34" r="4" /><circle cx="133" cy="20" r="2" /></g>
    </svg>
  )
}
