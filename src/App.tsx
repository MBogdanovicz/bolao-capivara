import { BrowserRouter, Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import CreatePool from './pages/CreatePool'
import JoinPool from './pages/JoinPool'
import Login from './pages/Login'
import MyPools from './pages/MyPools'
import Bonus from './pages/pool/Bonus'
import Table from './pages/pool/Table'
import PoolLayout from './pages/pool/PoolLayout'
import Predictions from './pages/pool/Predictions'
import Ranking from './pages/pool/Ranking'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route path="/" element={<RequireAuth><MyPools /></RequireAuth>} />
          <Route path="/convite/:code" element={<RequireAuth><JoinPool /></RequireAuth>} />
          <Route path="/bolao/novo" element={<RequireAuth><CreatePool /></RequireAuth>} />
          <Route path="/bolao/:poolId" element={<RequireAuth><PoolLayout /></RequireAuth>}>
            <Route index element={<Predictions />} />
            <Route path="ranking" element={<Ranking />} />
            <Route path="bonus" element={<Bonus />} />
            <Route path="tabela" element={<Table />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
