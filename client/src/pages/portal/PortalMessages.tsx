import { useEffect, useState, useRef } from 'react';
import { portalApi } from '../../api/portalApi';
import { toast } from 'sonner';
import { MessageSquare, Send, ArrowRight, Loader2, Plus } from 'lucide-react';

export default function PortalMessages() {
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [newMsg, setNewMsg] = useState({ doctorId: '', subject: '', body: '' });
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [fetchingDir, setFetchingDir] = useState(false);

  const fetchThreads = () => {
    portalApi.get('/messages/threads')
      .then(res => setThreads(res.data?.items || res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchThreads();
    const interval = setInterval(fetchThreads, 30000);
    return () => clearInterval(interval);
  }, []);

  const openThread = (threadId: string) => {
    setSelectedThread(threadId);
    setMsgLoading(true);
    portalApi.get(`/messages/${threadId}`)
      .then(res => {
        setMessages(res.data?.items || res.data || []);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .finally(() => setMsgLoading(false));
  };

  const openCompose = async () => {
    setShowCompose(true);
    setNewMsg({ doctorId: '', subject: '', body: '' });
    setSelectedDept(null);
    setDoctors([]);
    if (departments.length === 0) {
      setFetchingDir(true);
      try {
        const res = await portalApi.get('/directory/departments');
        setDepartments(res.data || []);
      } catch {
        toast.error('فشل تحميل الأقسام');
      } finally {
        setFetchingDir(false);
      }
    }
  };

  const handleDeptChange = async (deptId: number) => {
    setSelectedDept(deptId);
    setNewMsg({ ...newMsg, doctorId: '' });
    if (!deptId) {
      setDoctors([]);
      return;
    }
    setFetchingDir(true);
    try {
      const res = await portalApi.get(`/directory/doctors?departmentId=${deptId}`);
      setDoctors(res.data || []);
    } catch {
      toast.error('فشل تحميل الأطباء');
    } finally {
      setFetchingDir(false);
    }
  };

  const handleSendNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await portalApi.post('/messages', { doctorId: Number(newMsg.doctorId), subject: newMsg.subject || undefined, body: newMsg.body });
      toast.success('تم إرسال الرسالة');
      setShowCompose(false);
      setNewMsg({ doctorId: '', subject: '', body: '' });
      fetchThreads();
    } catch (err: any) { toast.error(err.response?.data?.message || 'فشل الإرسال'); }
    finally { setSending(false); }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || !selectedThread) return;
    const doctorId = messages.find((m: any) => m.doctorId)?.doctorId;
    if (!doctorId) return;
    setSending(true);
    try {
      await portalApi.post('/messages', { doctorId, body: replyBody, threadId: selectedThread });
      setReplyBody('');
      openThread(selectedThread);
      fetchThreads();
    } catch (err: any) { toast.error(err.response?.data?.message || 'فشل الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <div className="portal-page">
      <div className="portal-page-header">
        <h1><MessageSquare size={28} /> المراسلات</h1>
        <button className="portal-primary-btn" onClick={openCompose}><Plus size={18} /> رسالة جديدة</button>
      </div>

      {showCompose && (
        <div className="portal-modal-overlay"><div className="portal-modal">
          <div className="portal-modal-header"><h2>رسالة جديدة</h2><button onClick={() => setShowCompose(false)}>✕</button></div>
          <form onSubmit={handleSendNew} className="portal-form">
            <div className="portal-input-group">
              <label>القسم</label>
              <select 
                value={selectedDept || ''} 
                onChange={e => handleDeptChange(Number(e.target.value))}
                required
              >
                <option value="">-- اختر القسم --</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="portal-input-group">
              <label>الطبيب</label>
              <select 
                value={newMsg.doctorId} 
                onChange={e => setNewMsg({...newMsg, doctorId: e.target.value})}
                required
                disabled={!selectedDept || fetchingDir}
              >
                <option value="">{fetchingDir ? 'جاري التحميل...' : '-- اختر الطبيب --'}</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>د. {d.fullName} ({d.specialty || 'عام'})</option>
                ))}
              </select>
            </div>
            <div className="portal-input-group"><label>الموضوع</label><input type="text" value={newMsg.subject} onChange={e => setNewMsg({...newMsg, subject: e.target.value})} /></div>
            <div className="portal-input-group"><label>الرسالة</label><textarea value={newMsg.body} rows={4} onChange={e => setNewMsg({...newMsg, body: e.target.value})} required /></div>
            <button type="submit" className="portal-submit-btn" disabled={sending}>{sending ? <Loader2 className="animate-spin" size={18}/> : 'إرسال'}</button>
          </form>
        </div></div>
      )}

      <div className="portal-messaging-layout">
        <div className={`portal-threads ${selectedThread ? 'hide-mobile' : ''}`}>
          {loading ? <div className="portal-page-loader"><Loader2 className="animate-spin" size={24}/></div> : threads.length === 0 ? (
            <div className="portal-empty small"><MessageSquare size={36}/><p>لا توجد محادثات</p></div>
          ) : threads.map((t: any) => (
            <div key={t.threadId} className={`portal-thread-item ${selectedThread === t.threadId ? 'active' : ''}`} onClick={() => openThread(t.threadId)}>
              <div className="portal-thread-top"><span className="portal-thread-doctor">د. {t.doctorName}</span>{t.unreadCount > 0 && <span className="portal-badge">{t.unreadCount}</span>}</div>
              {t.subject && <p className="portal-thread-subject">{t.subject}</p>}
              <p className="portal-thread-preview">{t.body?.slice(0, 60)}...</p>
              <span className="portal-thread-time">{new Date(t.createdAt).toLocaleDateString('ar-LY', { month: 'short', day: 'numeric' })}</span>
            </div>
          ))}
        </div>

        <div className={`portal-chat ${selectedThread ? 'show' : ''}`}>
          {!selectedThread ? <div className="portal-empty"><MessageSquare size={48}/><p>اختر محادثة</p></div> : msgLoading ? <div className="portal-page-loader"><Loader2 className="animate-spin" size={24}/></div> : (
            <>
              <div className="portal-chat-header"><button className="portal-back-btn mobile-only" onClick={() => setSelectedThread(null)}><ArrowRight size={18}/> رجوع</button></div>
              <div className="portal-chat-messages">
                {messages.map((msg: any) => (
                  <div key={msg.id} className={`portal-message ${msg.direction === 'PATIENT_TO_DOCTOR' ? 'sent' : 'received'}`}>
                    <div className="portal-message-bubble"><p>{msg.body}</p><span className="portal-message-time">{new Date(msg.createdAt).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}</span></div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              <form onSubmit={handleReply} className="portal-chat-input">
                <input type="text" value={replyBody} onChange={e => setReplyBody(e.target.value)} placeholder="اكتب رسالتك..."/>
                <button type="submit" disabled={sending || !replyBody.trim()}><Send size={18}/></button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
