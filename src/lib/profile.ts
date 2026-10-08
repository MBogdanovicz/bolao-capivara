import { supabase } from './supabase'

// Saves the user's name (unique, ignoring case). Returns the saved name, or
// the message to show when it can't be used.
export async function saveNickname(userId: string, raw: string): Promise<{ name: string } | { error: string }> {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (name.length < 2) return { error: 'Use pelo menos 2 letras.' }
  const { error } = await supabase.from('profiles').update({ nickname: name }).eq('id', userId)
  if (error?.code === '23505') return { error: 'Esse nome já está em uso. Escolha outro.' }
  if (error) return { error: 'Não foi possível salvar. Tente de novo.' }
  return { name }
}
