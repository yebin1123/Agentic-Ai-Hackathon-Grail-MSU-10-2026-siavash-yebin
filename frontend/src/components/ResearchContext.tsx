import type { CryptoAnalysisRequest, CryptoAnalysisResponse } from '../types/crypto'
import { ProfileSummary } from './ProfilePanel'

export function ResearchContext({ request, response }: { request: CryptoAnalysisRequest; response: CryptoAnalysisResponse }) {
  if (!request.profile && !response.applied_profile && !response.personalized_notes?.length) return null
  return <article className="card card--profile" aria-labelledby="research-context-title">
    <p className="section-label">Explanation context</p><h2 id="research-context-title">Profile for this answer</h2>
    <p className="meta-copy">This is the completed request's profile, not the current draft. Preferences guide explanations, not token safety or buy/sell advice.</p>
    <h3>Submitted profile</h3>
    {request.profile ? <ProfileSummary profile={request.profile} /> : <p className="meta-copy">No profile was submitted.</p>}
    <h3>Applied profile reported by the service</h3>
    {response.applied_profile ? <ProfileSummary profile={response.applied_profile} /> : <p className="meta-copy">The service did not report an applied profile. Personalization is not confirmed.</p>}
    {!!response.personalized_notes?.length && <section aria-label="Tailored notes"><h3>Tailored notes</h3><ul className="bullet-list">{response.personalized_notes.map((note, index) => <li className="bullet-item" key={index}><h4 className="item-title">{note.title}</h4><p className="item-detail">{note.detail}</p></li>)}</ul></section>}
  </article>
}
