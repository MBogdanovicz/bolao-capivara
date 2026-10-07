import { Link } from 'react-router'

export default function ComingSoon({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      <p>Em construção.</p>
      <Link to="/">Voltar</Link>
    </main>
  )
}
