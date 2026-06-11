import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, bonusValue, type StatBonuses } from './supabaseClient';
import { QrScanner } from './QrScanner';
import logo from '../images/product_images/logo.png';

// Admin access is enforced server-side: RLS policies gate every write, and
// the is_admin() RPC tells the UI whether the signed-in account qualifies.
// The admin email lives only inside Supabase — never in this codebase.

interface AdminCritter {
  id: string;
  name: string | null;
  rarity: string;
  strength: number;
  health: number;
  stamina: number;
  level: number | null;
  xp: number | null;
  photo_url: string | null;
  stat_bonuses: StatBonuses | null;
  card_number: number | null;
}

type StatKey = 'strength' | 'health' | 'stamina';

/** Downscale + JPEG-compress a camera photo before upload (~1200px, q0.85) */
async function compressImage(file: File, maxDim = 1200, quality = 0.85): Promise<Blob> {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', quality)
  );
}

export function AdminPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [session,   setSession]   = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  // null = access check in flight for the current session
  const [isAdmin,   setIsAdmin]   = useState<boolean | null>(null);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [authBusy,  setAuthBusy]  = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Critter editing ─────────────────────────────────────────────────────────
  const [scanOpen,  setScanOpen]  = useState(false);
  const [manualId,  setManualId]  = useState('');
  const [critter,   setCritter]   = useState<AdminCritter | null>(null);
  const [loadBusy,  setLoadBusy]  = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveBusy,  setSaveBusy]  = useState(false);
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ask the server whether this session is the admin account
  useEffect(() => {
    if (!session) { setIsAdmin(null); return; }
    let cancelled = false;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!cancelled) setIsAdmin(!error && data === true);
    });
    return () => { cancelled = true; };
  }, [session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true); setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(), password,
    });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
    setPassword('');
  };

  const handleSignOut = () => {
    supabase.auth.signOut();
    setCritter(null); setSaveMsg(null); setLoadError(null);
  };

  // ── Load a critter (from scan, 8-char ID, or printed card number) ──────────
  const loadCritter = async (raw: string) => {
    const q = raw.trim().toUpperCase();
    if (!q) return;
    setScanOpen(false); setLoadBusy(true); setLoadError(null); setSaveMsg(null);
    // All-digit input = the card number printed below the QR (e.g. 1105);
    // otherwise it's the 8-character critter ID
    const byCardNumber = /^\d{1,6}$/.test(q);
    let query = supabase
      .from('critters')
      .select('id, name, rarity, strength, health, stamina, level, xp, photo_url, stat_bonuses, card_number');
    query = byCardNumber ? query.eq('card_number', Number(q)) : query.eq('id', q);
    const { data, error } = await query.limit(2);
    setLoadBusy(false);
    if (error || !data || data.length === 0) {
      setLoadError(`No critter found for ${byCardNumber ? 'card number' : 'ID'} ${q}.`);
      return;
    }
    if (data.length > 1) {
      setLoadError(`Card number ${q} matches more than one critter — load it by its 8-character ID instead.`);
      return;
    }
    setCritter(data[0] as AdminCritter);
  };

  const setStat = (k: StatKey, delta: number) =>
    setCritter(c => c ? { ...c, [k]: Math.max(0, Math.min(9, c[k] + delta)) } : c);

  // ── Save name + stats ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!critter || saveBusy) return;
    setSaveBusy(true); setSaveMsg(null);
    const { data, error } = await supabase
      .from('critters')
      .update({
        name: critter.name?.trim() || null,
        strength: critter.strength,
        health: critter.health,
        stamina: critter.stamina,
      })
      .eq('id', critter.id)
      .select();
    setSaveBusy(false);
    if (error) { setSaveMsg(`❌ Save failed: ${error.message}`); return; }
    // RLS silently updates 0 rows when the login isn't the admin account
    if (!data || data.length === 0) { setSaveMsg('❌ Not authorized — this login cannot edit critters.'); return; }
    setSaveMsg('✅ Saved.');
  };

  // ── Photo: capture → compress → upload to storage → save URL ───────────────
  const handlePhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';   // allow re-taking the same photo
    if (!file || !critter || photoBusy) return;
    setPhotoBusy(true); setSaveMsg(null);
    try {
      const blob = await compressImage(file);
      const path = `${critter.id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('critter-photos')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('critter-photos').getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;   // cache-bust replaced photos
      const { data, error } = await supabase
        .from('critters').update({ photo_url: url }).eq('id', critter.id).select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('not authorized');
      setCritter(c => c ? { ...c, photo_url: url } : c);
      setSaveMsg('✅ Photo saved.');
    } catch (err) {
      setSaveMsg(`❌ Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPhotoBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="adm-root">
      <div className="adm-inner">
        <a href="/" aria-label="Go to Critical Critter Clash home">
          <img src={logo} alt="Critical Critter Clash" className="adm-logo" />
        </a>
        <h1 className="adm-title">⚙️ Admin</h1>

        {!authReady ? (
          <p className="adm-dim">Checking session…</p>

        ) : !session ? (
          /* ── Login ── */
          <form className="adm-card" onSubmit={handleLogin}>
            <label className="adm-label" htmlFor="adm-email">Email</label>
            <input id="adm-email" className="adm-input" type="email" autoComplete="username"
              value={email} onChange={e => setEmail(e.target.value)} />
            <label className="adm-label" htmlFor="adm-pass">Password</label>
            <input id="adm-pass" className="adm-input" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} />
            {authError && <p className="adm-error">{authError}</p>}
            <button className="adm-btn adm-btn--primary" type="submit" disabled={authBusy || !password}>
              {authBusy ? '⏳ Signing in…' : 'Sign In'}
            </button>
          </form>

        ) : isAdmin === null ? (
          /* ── Access check in flight ── */
          <p className="adm-dim">Checking access…</p>

        ) : !isAdmin ? (
          /* ── Wrong account ── */
          <div className="adm-card">
            <p className="adm-error">Signed in as {session.user.email}, which is not an admin account.</p>
            <button className="adm-btn" onClick={handleSignOut}>Sign Out</button>
          </div>

        ) : (
          /* ── Admin tools ── */
          <>
            <div className="adm-session-row">
              <span className="adm-dim">{session.user.email}</span>
              <button className="adm-btn adm-btn--small" onClick={handleSignOut}>Sign Out</button>
            </div>

            {/* Critter lookup */}
            <div className="adm-card">
              <h2 className="adm-card-title">Load a Critter</h2>
              {scanOpen ? (
                <>
                  <QrScanner onScan={loadCritter} onError={msg => setLoadError(msg)} />
                  <button className="adm-btn" onClick={() => setScanOpen(false)}>Cancel Scan</button>
                </>
              ) : (
                <div className="adm-lookup-row">
                  <button className="adm-btn adm-btn--primary" onClick={() => { setLoadError(null); setScanOpen(true); }}>
                    📷 Scan Card
                  </button>
                  <span className="adm-dim">or</span>
                  <input className="adm-input adm-input--id" type="text" placeholder="ID or card #"
                    maxLength={8} value={manualId}
                    onChange={e => setManualId(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') loadCritter(manualId); }} />
                  <button className="adm-btn" onClick={() => loadCritter(manualId)} disabled={loadBusy || manualId.trim().length === 0}>
                    {loadBusy ? '⏳' : 'Load'}
                  </button>
                </div>
              )}
              {loadError && <p className="adm-error">{loadError}</p>}
            </div>

            {/* Editor */}
            {critter && (
              <div className="adm-card">
                <h2 className="adm-card-title">
                  #{critter.id} <span className="adm-rarity">{critter.rarity}</span>
                </h2>
                <p className="adm-dim">
                  Level {critter.level ?? 1} · {critter.xp ?? 0} XP
                  {critter.card_number != null && <> · Card {critter.card_number}</>}
                </p>

                {/* Photo */}
                <div className="adm-photo-row">
                  {critter.photo_url
                    ? <img src={critter.photo_url} alt={critter.name ?? critter.id} className="adm-photo" />
                    : <div className="adm-photo adm-photo--empty"><span>🐾</span><span className="adm-dim">No photo</span></div>}
                  <button className="adm-btn" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    {photoBusy ? '⏳ Uploading…' : critter.photo_url ? '📷 Retake Photo' : '📷 Take Photo'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={handlePhotoPicked} />
                </div>

                {/* Name */}
                <label className="adm-label" htmlFor="adm-name">Name</label>
                <input id="adm-name" className="adm-input" type="text" maxLength={24}
                  value={critter.name ?? ''}
                  onChange={e => setCritter(c => c ? { ...c, name: e.target.value } : c)} />

                {/* Stats — these are the PRINTED card values; level-up
                    bonuses live in stat_bonuses and are shown read-only */}
                {(() => {
                  const parts = (['strength','health','stamina'] as const)
                    .map(k => ({ k, v: bonusValue(critter.stat_bonuses, k) }))
                    .filter(x => x.v > 0)
                    .map(x => `+${x.v} ${({strength:'⚔️',health:'❤️',stamina:'🛡️'})[x.k]}`);
                  return parts.length > 0
                    ? <p className="adm-dim">Level bonuses (not editable): {parts.join(' · ')}</p>
                    : null;
                })()}
                <div className="adm-stats">
                  {([
                    ['strength', '⚔️', 'Strength'],
                    ['health',   '❤️', 'Health'],
                    ['stamina',  '🛡️', 'Stamina'],
                  ] as [StatKey, string, string][]).map(([k, icon, label]) => (
                    <div key={k} className="adm-stat-row">
                      <span className="adm-stat-name">{icon} {label}</span>
                      <div className="adm-stat-ctrl">
                        <button onClick={() => setStat(k, -1)} disabled={critter[k] <= 0}>−</button>
                        <span className="adm-stat-val">{critter[k]}</span>
                        <button onClick={() => setStat(k, 1)} disabled={critter[k] >= 9}>+</button>
                      </div>
                    </div>
                  ))}
                </div>

                <button className="adm-btn adm-btn--primary" onClick={handleSave} disabled={saveBusy}>
                  {saveBusy ? '⏳ Saving…' : '💾 Save Changes'}
                </button>
                {saveMsg && <p className={saveMsg.startsWith('✅') ? 'adm-ok' : 'adm-error'}>{saveMsg}</p>}
                <a className="adm-view-link" href={`/${critter.id}`} target="_blank" rel="noreferrer">
                  View public card page →
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
