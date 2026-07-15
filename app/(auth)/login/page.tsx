import { Suspense } from 'react'
import LoginForm from './LoginForm'
import './login.css'

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="login-page login-page--loading">
          <p className="pg-loading">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
