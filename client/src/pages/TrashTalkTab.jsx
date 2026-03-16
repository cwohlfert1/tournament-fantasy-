import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import TeamAvatar from '../components/TeamAvatar';
import GiphyPicker from '../components/GiphyPicker';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── GIF display helper ────────────────────────────────────────────────────────
function GifImage({ url, className = '' }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt="GIF"
      className={`rounded-xl max-w-xs w-full object-cover ${className}`}
      style={{ maxHeight: 240 }}
      loading="lazy"
    />
  );
}

// ── Post composer (wall + reply) ──────────────────────────────────────────────
function Composer({ placeholder, onSubmit, compact = false, autoFocus = false }) {
  const [text, setText] = useState('');
  const [gifUrl, setGifUrl] = useState('');
  const [showGiphy, setShowGiphy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim() && !gifUrl) return;
    setSubmitting(true);
    try {
      await onSubmit(text.trim(), gifUrl);
      setText('');
      setGifUrl('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2">
      {gifUrl && (
        <div className="relative inline-block">
          <GifImage url={gifUrl} />
          <button
            onClick={() => setGifUrl('')}
            className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-black"
          >×</button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={compact ? 1 : 2}
          className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-xl border border-gray-700 focus:outline-none focus:border-brand-500 placeholder-gray-500 resize-none"
        />
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowGiphy(s => !s)}
            className="px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-xs font-bold"
            title="Add GIF"
          >GIF</button>
          {showGiphy && (
            <GiphyPicker
              onSelect={(url) => { setGifUrl(url); setShowGiphy(false); }}
              onClose={() => setShowGiphy(false)}
            />
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting || (!text.trim() && !gifUrl)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {submitting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ── Reaction button ───────────────────────────────────────────────────────────
function ReactionBtn({ emoji, label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
        active
          ? 'bg-brand-500/20 border-brand-500/50 text-brand-400'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
      }`}
    >
      {emoji} {count > 0 ? count : label}
    </button>
  );
}

// ── Single wall post ──────────────────────────────────────────────────────────
function WallPost({ post, currentUser, isCommissioner, leagueId, onReact, onReply, onDelete }) {
  const [replyOpen, setReplyOpen] = useState(false);

  const respect = post.reactions?.respect || { count: 0, userIds: [] };
  const fire = post.reactions?.fire || { count: 0, userIds: [] };
  const myRespect = respect.userIds.includes(currentUser?.id);
  const myFire = fire.userIds.includes(currentUser?.id);

  const canDelete = !post.is_system && (post.user_id === currentUser?.id || isCommissioner);

  return (
    <div className={`rounded-xl p-4 border ${post.is_system ? 'bg-gray-900/40 border-gray-800/60' : 'bg-gray-900 border-gray-800'}`}>
      <div className="flex items-start gap-3">
        {post.is_system ? (
          <span className="text-lg mt-0.5 flex-shrink-0">🤖</span>
        ) : (
          <div className="flex-shrink-0">
            <TeamAvatar avatarUrl={post.team_avatar} teamName={post.team_name || post.username} size="sm" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {post.is_system ? (
              <span className="text-gray-400 text-xs italic">{post.text}</span>
            ) : (
              <>
                <span className="text-white font-semibold text-sm">{post.team_name || post.username}</span>
                <span className="text-gray-500 text-xs">{post.username}</span>
                <span className="text-gray-600 text-xs">{timeAgo(post.created_at)}</span>
                {canDelete && (
                  <button
                    onClick={() => onDelete(post.id)}
                    className="ml-auto text-gray-600 hover:text-red-400 text-xs transition-colors"
                  >Delete</button>
                )}
              </>
            )}
          </div>

          {!post.is_system && (
            <>
              {post.text && <p className="text-gray-200 text-sm whitespace-pre-wrap break-words mb-2">{post.text}</p>}
              {post.gif_url && <div className="mb-2"><GifImage url={post.gif_url} /></div>}

              {/* Reactions + Reply */}
              <div className="flex items-center gap-2 flex-wrap">
                <ReactionBtn emoji="👊" label="Respect" count={respect.count} active={myRespect} onClick={() => onReact(post.id, 'respect')} />
                <ReactionBtn emoji="🔥" label="Fire" count={fire.count} active={myFire} onClick={() => onReact(post.id, 'fire')} />
                <button
                  onClick={() => setReplyOpen(s => !s)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-1"
                >
                  💬 Reply{post.replies?.length > 0 ? ` (${post.replies.length})` : ''}
                </button>
              </div>

              {/* Replies */}
              {(replyOpen || post.replies?.length > 0) && (
                <div className="mt-3 pl-3 border-l border-gray-800 space-y-2">
                  {post.replies?.map(reply => (
                    <div key={reply.id} className="flex items-start gap-2">
                      <TeamAvatar avatarUrl={reply.team_avatar} teamName={reply.team_name || reply.username} size="xs" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-white text-xs font-semibold">{reply.team_name || reply.username}</span>
                          <span className="text-gray-600 text-xs">{timeAgo(reply.created_at)}</span>
                          {(reply.user_id === currentUser?.id || isCommissioner) && (
                            <button
                              onClick={() => onDelete(null, reply.id)}
                              className="ml-auto text-gray-700 hover:text-red-400 text-xs"
                            >×</button>
                          )}
                        </div>
                        {reply.text && <p className="text-gray-300 text-xs whitespace-pre-wrap break-words">{reply.text}</p>}
                        {reply.gif_url && <GifImage url={reply.gif_url} className="mt-1 max-w-[200px]" />}
                      </div>
                    </div>
                  ))}
                  {replyOpen && (
                    <Composer
                      placeholder="Reply..."
                      compact
                      autoFocus
                      onSubmit={async (text, gif_url) => {
                        await onReply(post.id, text, gif_url);
                        setReplyOpen(false);
                      }}
                    />
                  )}
                  {!replyOpen && (
                    <button
                      onClick={() => setReplyOpen(true)}
                      className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >+ Reply</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function ChatBubble({ msg, isMe }) {
  return (
    <div className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse' : ''}`}>
      <div className="flex-shrink-0 mb-1">
        <TeamAvatar avatarUrl={msg.avatar_url} teamName={msg.team_name || msg.username} size="xs" />
      </div>
      <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isMe && (
          <span className="text-gray-500 text-xs px-1">{msg.team_name || msg.username}</span>
        )}
        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            isMe
              ? 'bg-brand-500 text-white rounded-br-sm'
              : 'bg-gray-800 text-gray-200 rounded-bl-sm'
          }`}
        >
          {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
          {msg.gif_url && <GifImage url={msg.gif_url} className="mt-1 max-w-[220px]" />}
        </div>
        <span className={`text-gray-600 text-[10px] px-1 ${isMe ? 'text-right' : ''}`}>
          {fmtTime(msg.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Main tab component ────────────────────────────────────────────────────────

export default function TrashTalkTab({ leagueId, isCommissioner }) {
  const { user } = useAuth();
  const token = localStorage.getItem('token');

  // Wall state
  const [posts, setPosts] = useState([]);
  const [wallLoading, setWallLoading] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatGif, setChatGif] = useState('');
  const [showChatGiphy, setShowChatGiphy] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  // Socket
  const socketRef = useRef(null);

  // ── Socket setup ────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_league_room', { leagueId, token });
      socket.emit('league_chat_join', { leagueId, token });
    });

    // Wall events
    socket.on('wall_new_post', (post) => {
      setPosts(prev => [post, ...prev]);
    });

    socket.on('wall_post_deleted', ({ postId }) => {
      setPosts(prev => prev.filter(p => p.id !== postId));
    });

    socket.on('wall_reaction_update', ({ postId, reactions }) => {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions } : p));
    });

    socket.on('wall_new_reply', ({ postId, reply }) => {
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, replies: [...(p.replies || []), reply] } : p
      ));
    });

    socket.on('wall_reply_deleted', ({ replyId, postId }) => {
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, replies: (p.replies || []).filter(r => r.id !== replyId) }
          : p
      ));
    });

    // Chat events
    socket.on('league_chat_history', (history) => {
      setMessages(history);
    });

    socket.on('league_chat_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => socket.disconnect();
  }, [leagueId, token]);

  // ── Auto scroll chat ────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load wall posts ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get(`/wall/league/${leagueId}/posts`)
      .then(res => setPosts(res.data.posts || []))
      .catch(console.error)
      .finally(() => setWallLoading(false));
  }, [leagueId]);

  // ── Wall handlers ───────────────────────────────────────────────────────
  const handlePost = async (text, gif_url) => {
    await api.post(`/wall/league/${leagueId}/posts`, { text, gif_url });
    // Socket will push the new post back
  };

  const handleReact = async (postId, reaction_type) => {
    try {
      await api.post(`/wall/posts/${postId}/react`, { reaction_type });
    } catch (err) {
      console.error(err);
    }
  };

  const handleReply = async (postId, text, gif_url) => {
    await api.post(`/wall/posts/${postId}/replies`, { text, gif_url });
  };

  const handleDelete = async (postId, replyId) => {
    try {
      if (replyId) {
        await api.delete(`/wall/replies/${replyId}`);
      } else {
        await api.delete(`/wall/posts/${postId}`);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  // ── Chat send ────────────────────────────────────────────────────────────
  const sendChatMessage = useCallback(() => {
    if (!chatText.trim() && !chatGif) return;
    setChatSending(true);
    socketRef.current?.emit('league_chat_send', {
      leagueId,
      token,
      text: chatText.trim(),
      gifUrl: chatGif || null,
    });
    setChatText('');
    setChatGif('');
    setChatSending(false);
    chatInputRef.current?.focus();
  }, [chatText, chatGif, leagueId, token]);

  const handleChatKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Wall Posts ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          📣 Trash Talk Wall
        </h2>

        {/* Composer */}
        <div className="card p-4 mb-4">
          <Composer
            placeholder="Talk your trash... 🗑️"
            onSubmit={handlePost}
          />
        </div>

        {/* Posts */}
        {wallLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="card p-10 text-center text-gray-500">
            <div className="text-3xl mb-2">🗑️</div>
            <p>No trash talk yet. You going first? 👀</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <WallPost
                key={post.id}
                post={post}
                currentUser={user}
                isCommissioner={isCommissioner}
                leagueId={leagueId}
                onReact={handleReact}
                onReply={handleReply}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Live Chat ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
          💬 Live Chat
          <span className="inline-flex items-center gap-1 text-xs bg-green-900/30 border border-green-700/40 text-green-400 px-2 py-0.5 rounded-full font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        </h2>

        <div className="card overflow-hidden flex flex-col" style={{ height: 480 }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-950/40">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-600 text-sm">
                No messages yet. Say something!
              </div>
            ) : (
              messages.map(msg => (
                <ChatBubble
                  key={msg.id}
                  msg={msg}
                  isMe={msg.user_id === user?.id}
                />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-3 space-y-2 bg-gray-900">
            {chatGif && (
              <div className="relative inline-block">
                <GifImage url={chatGif} className="max-w-[160px]" />
                <button
                  onClick={() => setChatGif('')}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-black"
                >×</button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <input
                ref={chatInputRef}
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={handleChatKey}
                placeholder="Aa"
                className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded-full border border-gray-700 focus:outline-none focus:border-brand-500 placeholder-gray-500"
              />
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowChatGiphy(s => !s)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-[10px] font-bold"
                  title="Add GIF"
                >GIF</button>
                {showChatGiphy && (
                  <GiphyPicker
                    onSelect={(url) => { setChatGif(url); setShowChatGiphy(false); }}
                    onClose={() => setShowChatGiphy(false)}
                  />
                )}
              </div>
              <button
                onClick={sendChatMessage}
                disabled={chatSending || (!chatText.trim() && !chatGif)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-brand-500 hover:bg-brand-400 text-white transition-colors disabled:opacity-50"
                title="Send"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
