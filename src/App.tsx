import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import ComingSoon from './pages/ComingSoon'
import JoinPool from './pages/JoinPool'
import Login from './pages/Login'
import MyPools from './pages/MyPools'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route path="/" element={<RequireAuth><MyPools /></RequireAuth>} />
          <Route path="/convite/:code" element={<RequireAuth><JoinPool /></RequireAuth>} />
          <Route path="/bolao/novo" element={<RequireAuth><ComingSoon title="Criar bolão" /></RequireAuth>} />
          <Route path="/bolao/:poolId" element={<RequireAuth><ComingSoon title="Palpites" /></RequireAuth>} />
          <Route path="/bolao/:poolId/ranking" element={<RequireAuth><ComingSoon title="Ranking" /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
