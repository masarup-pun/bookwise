(function () {
  'use strict';

  const app = window.BookwiseApp;
  const config = window.BOOKWISE_SUPABASE;
  const dialog = document.getElementById('account-dialog');
  const status = document.getElementById('account-status');
  const form = document.getElementById('account-form');
  const signedIn = document.getElementById('account-signed-in');
  const importButton = document.getElementById('account-import');
  const reloadButton = document.getElementById('account-reload');
  const signoutButton = document.getElementById('account-signout');
  const sendButton = document.getElementById('account-send');
  const buttons = [document.getElementById('reader-account-button')];
  const authRedirectUrl = 'https://masarup-pun.github.io/bookwise/';
  const authErrorParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const authErrorCode = authErrorParams.get('error_code');
  let client = null;
  let user = null;
  let revision = 0;
  let pending = null;
  let syncing = false;
  let conflicted = false;
  let timer = null;
  let generation = 0;
  let activatingUserId = null;

  function message(value) {
    status.textContent = value;
  }

  function showAuthLinkError() {
    const text = authErrorCode === 'otp_expired'
      ? 'ลิงก์นี้หมดอายุหรือถูกใช้แล้ว · กรอกอีเมลเพื่อขอลิงก์ใหม่'
      : 'ยืนยันอีเมลไม่สำเร็จ · กรอกอีเมลแล้วขอลิงก์ใหม่';
    if (!dialog.open) dialog.showModal();
    message(text);
    history.replaceState(null, '', location.pathname + location.search);
  }

  function setUser(next) {
    user = next;
    form.hidden = Boolean(next);
    signedIn.hidden = !next;
    document.getElementById('account-current-email').textContent = next?.email || '';
    const emptyLogin = document.getElementById('empty-login');
    const emptyDescription = document.getElementById('empty-description');
    const menuEmail = document.getElementById('account-menu-email');
    const menuAction = document.getElementById('account-menu-action');
    if (emptyLogin) emptyLogin.hidden = Boolean(next);
    if (emptyDescription) emptyDescription.textContent = next
      ? 'เข้าสู่ระบบแล้ว · ห้องสมุดของคุณยังไม่มีหนังสือ'
      : 'เข้าสู่ระบบหรือสร้างบัญชีด้วยอีเมล เพื่อบันทึกและซิงก์ห้องสมุดข้ามอุปกรณ์';
    if (menuEmail) menuEmail.textContent = next?.email || 'ยังไม่ได้เข้าสู่ระบบ';
    if (menuAction) menuAction.textContent = next ? 'จัดการบัญชีและการซิงก์' : 'เข้าสู่ระบบ / สร้างบัญชี';
    buttons.forEach(button => {
      button.textContent = next ? 'บัญชี' : 'เข้าสู่ระบบ';
      button.setAttribute('aria-label', next ? 'บัญชีและการซิงก์' : 'เข้าสู่ระบบเพื่อซิงก์ข้อมูล');
    });
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function mergeStates(remote, local) {
    const result = clone(remote);
    result.books = { ...(remote.books || {}) };
    for (const [id, guest] of Object.entries(local.books || {})) {
      const saved = result.books[id] || {};
      result.books[id] = {
        chapter: (Number(guest.lastRead) || 0) > (Number(saved.lastRead) || 0) ? guest.chapter : saved.chapter ?? guest.chapter,
        progress: Math.max(Number(saved.progress) || 0, Number(guest.progress) || 0),
        favorite: Boolean(saved.favorite || guest.favorite),
        started: Boolean(saved.started || guest.started),
        completed: Boolean(saved.completed || guest.completed),
        lastRead: Math.max(Number(saved.lastRead) || 0, Number(guest.lastRead) || 0)
      };
    }
    for (const key of ['annotations', 'bookmarks', 'reviewQueue']) {
      const byId = new Map();
      for (const item of [...(local[key] || []), ...(remote[key] || [])]) {
        const id = item.id || `${item.bookId}:${item.chapter}:${item.questionIndex ?? ''}`;
        byId.set(id, item);
      }
      result[key] = [...byId.values()];
    }
    result.fontSizeCustomized = remote.fontSizeCustomized === true || local.fontSizeCustomized === true;
    result.fontSizePt = remote.fontSizeCustomized === true ? remote.fontSizePt :
      local.fontSizeCustomized === true ? local.fontSizePt : 30;
    delete result.fontSize;
    return result;
  }

  function isConflict(error) {
    return error?.code === 'P0001' || String(error?.message || '').includes('state_conflict');
  }

  async function readRemote(id) {
    const { data, error } = await client.from('user_states')
      .select('state,revision').eq('user_id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function writeRemote(expected, state) {
    const { data, error } = await client.rpc('save_user_state', {
      p_expected_revision: expected,
      p_state: state
    });
    if (error) throw error;
    return Number(data);
  }

  function schedule(state) {
    if (!user) return;
    pending = clone(state);
    message(conflicted ? 'มีข้อมูลใหม่จากอุปกรณ์อื่น โปรดตรวจสอบก่อนซิงก์' : 'บันทึกในเครื่องแล้ว · รอซิงก์');
    if (conflicted) return;
    clearTimeout(timer);
    timer = setTimeout(flush, 450);
  }

  async function flush() {
    clearTimeout(timer);
    if (syncing || !pending || !user || conflicted) return;
    syncing = true;
    const owner = user.id;
    const currentGeneration = generation;
    const state = pending;
    pending = null;
    message('กำลังซิงก์…');
    try {
      const nextRevision = await writeRemote(revision, state);
      if (generation !== currentGeneration || user?.id !== owner) return;
      revision = nextRevision;
      message(pending ? 'บันทึกในเครื่องแล้ว · รอซิงก์' : 'ซิงก์ล่าสุดแล้ว');
    } catch (error) {
      if (generation !== currentGeneration || user?.id !== owner) return;
      pending ||= state;
      if (isConflict(error)) {
        conflicted = true;
        message('ข้อมูลบนอุปกรณ์อื่นใหม่กว่า กรุณาโหลดข้อมูลล่าสุด');
      } else {
        message('ซิงก์ไม่สำเร็จ · ข้อมูลยังอยู่ในเครื่อง');
      }
    } finally {
      syncing = false;
      if (pending && !conflicted && navigator.onLine && user?.id === owner) {
        clearTimeout(timer);
        timer = setTimeout(flush, 5000);
      }
    }
  }

  async function activate(nextUser) {
    if (user?.id === nextUser.id || activatingUserId === nextUser.id) return;
    const currentGeneration = ++generation;
    activatingUserId = nextUser.id;
    clearTimeout(timer);
    pending = null;
    conflicted = false;
    message('กำลังโหลดข้อมูลจากบัญชี…');
    try {
      let row = await readRemote(nextUser.id);
      if (generation !== currentGeneration) return;
      if (!row) {
        const initial = clone(app.getGuestState());
        try {
          revision = await writeRemote(0, initial);
          row = { state: initial, revision };
        } catch (error) {
          if (!isConflict(error)) throw error;
          row = await readRemote(nextUser.id);
          if (!row) throw error;
        }
      }
      if (generation !== currentGeneration) return;
      revision = Number(row.revision);
      setUser(nextUser);
      app.activateAccount(nextUser.id, row.state);
      importButton.hidden = false;
      message('ซิงก์ล่าสุดแล้ว');
    } catch (error) {
      if (generation !== currentGeneration) return;
      setUser(nextUser);
      importButton.hidden = true;
      message('ยังเปิดข้อมูลบัญชีไม่ได้ · ข้อมูลยังอยู่ในเครื่อง โปรดตรวจ Supabase');
      console.error('Bookwise sync setup:', error);
    } finally {
      if (activatingUserId === nextUser.id) activatingUserId = null;
    }
  }

  function deactivate() {
    ++generation;
    clearTimeout(timer);
    pending = null;
    conflicted = false;
    revision = 0;
    activatingUserId = null;
    setUser(null);
    importButton.hidden = true;
    app.activateGuest();
    message('ข้อมูลในเครื่อง · เข้าสู่ระบบเพื่อซิงก์');
  }

  window.BookwiseCloudSync = { schedule, isSignedIn: () => Boolean(user) };
  if (!app || !config?.url || !config?.publishableKey || !/^https?:$/.test(location.protocol)) {
    if (!/^https?:$/.test(location.protocol)) {
      message('เปิดเว็บไซต์ผ่าน HTTPS เพื่อเข้าสู่ระบบ');
      form.addEventListener('submit', event => {
        event.preventDefault();
        message('ระบบเข้าสู่ระบบใช้ได้เมื่อเปิดเว็บไซต์ Bookwise ผ่าน HTTPS');
      });
    } else {
      message('ระบบเข้าสู่ระบบยังตั้งค่าไม่ครบ โปรดตรวจ Supabase');
      form.addEventListener('submit', event => {
        event.preventDefault();
        message('ระบบเข้าสู่ระบบยังตั้งค่าไม่ครบ โปรดตรวจ Supabase URL และ Publishable key');
      });
    }
    return;
  }

  buttons.forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => dialog.showModal());
  });
  document.getElementById('account-close').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) return;
    const email = document.getElementById('account-email').value.trim();
    sendButton.disabled = true;
    message('กำลังส่งลิงก์…');
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: authRedirectUrl }
    });
    sendButton.disabled = false;
    message(error ? `ส่งลิงก์ไม่สำเร็จ: ${error.message}` : 'ส่งลิงก์แล้ว · เปิดอีเมลและกดลิงก์เพื่อเข้าสู่ระบบ');
  });
  importButton.addEventListener('click', async () => {
    if (!user || pending || syncing || conflicted) {
      message('กรุณาซิงก์หรือโหลดข้อมูลล่าสุดก่อนนำเข้า');
      return;
    }
    const remote = await readRemote(user.id).catch(() => null);
    if (!remote || Number(remote.revision) !== revision) {
      conflicted = true;
      message('ข้อมูลบนอุปกรณ์อื่นใหม่กว่า กรุณาโหลดข้อมูลล่าสุด');
      return;
    }
    const merged = mergeStates(remote.state, app.getGuestState());
    pending = merged;
    await flush();
    if (!pending && !conflicted) {
      app.activateAccount(user.id, merged);
      importButton.hidden = true;
      app.toast('นำเข้าข้อมูลจากเครื่องนี้แล้ว');
    }
  });
  reloadButton.addEventListener('click', async () => {
    if (!user) return;
    if (syncing) { message('กรุณารอการซิงก์ให้เสร็จก่อน'); return; }
    if (pending && !window.confirm('ข้อมูลที่ยังไม่ซิงก์จะถูกแทนที่ด้วยข้อมูลล่าสุดจากบัญชี ต้องการดำเนินการต่อหรือไม่?')) return;
    const row = await readRemote(user.id).catch(() => null);
    if (!row) { message('โหลดข้อมูลล่าสุดไม่สำเร็จ'); return; }
    pending = null;
    conflicted = false;
    revision = Number(row.revision);
    app.activateAccount(user.id, row.state);
    message('โหลดข้อมูลล่าสุดแล้ว');
  });
  signoutButton.addEventListener('click', async () => {
    if (pending) await flush();
    if (pending || syncing) { message('ข้อมูลยังไม่ซิงก์ กรุณาลองใหม่เมื่อเชื่อมต่อได้'); return; }
    const { error } = await client.auth.signOut();
    if (error) { message(`ออกจากระบบไม่สำเร็จ: ${error.message}`); return; }
    deactivate();
    dialog.close();
  });
  window.addEventListener('online', () => { if (pending && !conflicted) flush(); });

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.onload = async () => {
    try {
      client = window.supabase.createClient(config.url, config.publishableKey);
      client.auth.onAuthStateChange((event, session) => {
        setTimeout(() => {
          if (session?.user) activate(session.user);
          else if (event === 'SIGNED_OUT') deactivate();
        }, 0);
      });
      const { data, error } = await client.auth.getUser();
      if (error && error.name !== 'AuthSessionMissingError') throw error;
      if (data.user) await activate(data.user);
      else if (authErrorCode) showAuthLinkError();
      else message('ข้อมูลในเครื่อง · เข้าสู่ระบบเพื่อซิงก์');
    } catch (error) {
      if (authErrorCode) showAuthLinkError();
      else message('เชื่อมต่อบัญชีไม่สำเร็จ · ข้อมูลยังอยู่ในเครื่อง');
      console.error('Bookwise Supabase:', error);
    }
  };
  script.onerror = () => message('โหลดระบบบัญชีไม่สำเร็จ · ตรวจการเชื่อมต่ออินเทอร์เน็ต');
  document.head.appendChild(script);
})();
