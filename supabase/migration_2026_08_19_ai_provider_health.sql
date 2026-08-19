-- Statistik ringan untuk memantau distribusi dan kesehatan AI provider.
-- Aman dijalankan ulang setelah migration free_ai_rotation + openrouter.

alter table public.ai_credentials
  add column if not exists success_count bigint not null default 0,
  add column if not exists failure_count bigint not null default 0,
  add column if not exists last_failure_at timestamptz;

-- Error billing lama jangan langsung dicoba berulang setelah deploy.
update public.ai_credentials
set enabled = false,
    cooldown_until = greatest(
      coalesce(cooldown_until, now()),
      now() + interval '24 hours'
    )
where last_error like '%[402]%';

-- Akun Cerebras personal saat ini sudah dimigrasikan ke PayGo. Nonaktifkan
-- credential yang ada agar rotasi tetap 100% gratis (bisa diaktifkan lagi
-- secara manual dari Settings jika billing Cerebras nanti sudah siap).
update public.ai_credentials
set enabled = false,
    last_error = coalesce(
      last_error,
      'Dinonaktifkan sementara: akun Cerebras memerlukan PayGo/payment method'
    ),
    updated_at = now()
where provider = 'cerebras';
