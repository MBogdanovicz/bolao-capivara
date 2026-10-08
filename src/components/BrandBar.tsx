import { Link } from 'react-router'

// Black top bar with the club crest; tapping it goes to the pool list.
export default function BrandBar() {
  return (
    <Link to="/" className="brandbar" aria-label="Bolão Capivara, meus bolões">
      <img src="/crest.png" alt="" />
      <span className="wordmark">Bolão <span>Capivara</span></span>
    </Link>
  )
}
