import {Bot,Paperclip} from 'lucide-react';

export default function TelegramResult({item}:{item:any}){
 const fields=item.fields||{};
 const received=fields.received_at?new Date(fields.received_at):null;
 return <div className="telegram-result">
  <div className="telegram-result-heading"><span className="telegram-result-icon"><Bot size={22}/></span><div><h4>{item.botName||String(fields.bot||'Telegram bot')}</h4><small className="muted">{String(fields.bot||'')}</small></div></div>
  {received&&!Number.isNaN(received.getTime())&&<time className="muted" dateTime={received.toISOString()}>{received.toLocaleString()}</time>}
  {fields.response&&<div className="telegram-result-message">{String(fields.response)}</div>}
  {fields.attachment&&<p className="telegram-result-attachment"><Paperclip size={14}/> Attachment received. Open Telegram to view it.</p>}
  {!fields.response&&!fields.attachment&&<p className="muted">Empty bot reply.</p>}
 </div>;
}
