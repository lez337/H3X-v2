using System;
using System.IO;
using System.Net;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.Win32;

sealed class ActionButton : Button {
 public bool Primary,Quiet;
 public ActionButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;SetStyle(ControlStyles.UserPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.AllPaintingInWmPaint,true);}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;var r=new Rectangle(1,1,Width-3,Height-3);using(var p=Setup.Round(r,9)){using(var b=new SolidBrush(!Enabled?Color.FromArgb(27,33,36):Primary?Color.FromArgb(159,223,207):Quiet?Color.FromArgb(14,18,21):Color.FromArgb(29,37,42)))e.Graphics.FillPath(b,p);using(var pen=new Pen(Color.FromArgb(44,58,65)))e.Graphics.DrawPath(pen,p);}TextRenderer.DrawText(e.Graphics,Text,Font,r,!Enabled?Color.FromArgb(86,99,105):Primary?Color.FromArgb(10,28,24):ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
}
sealed class TransferBar : Control {
 public int Value;public TransferBar(){DoubleBuffered=true;}
 protected override void OnPaint(PaintEventArgs e){using(var b=new SolidBrush(Color.FromArgb(35,44,48)))e.Graphics.FillRectangle(b,ClientRectangle);if(Value>0)using(var b=new SolidBrush(Color.FromArgb(159,223,207)))e.Graphics.FillRectangle(b,0,0,Width*Value/100,Height);}
}
class ReleaseInfo {public string Version,Name,Url,ChecksumsUrl;public long Size;}
class Setup : Form {
 const string Repo="lez337/H3X-v2";
 static readonly Color Ink=Color.FromArgb(236,242,244),Muted=Color.FromArgb(139,154,164),Accent=Color.FromArgb(159,223,207);
 Label status,detail,version,size;TransferBar progress;ActionButton install,repair,uninstall,cancel;WebClient active;ReleaseInfo release;bool busy;
 public static GraphicsPath Round(Rectangle r,int n){var p=new GraphicsPath();p.AddArc(r.X,r.Y,n*2,n*2,180,90);p.AddArc(r.Right-n*2,r.Y,n*2,n*2,270,90);p.AddArc(r.Right-n*2,r.Bottom-n*2,n*2,n*2,0,90);p.AddArc(r.X,r.Bottom-n*2,n*2,n*2,90,90);p.CloseFigure();return p;}
 Setup(bool preview=false){Text="H3X Searcher Setup";ClientSize=new Size(790,550);AutoScaleMode=AutoScaleMode.Dpi;StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.None;BackColor=Color.FromArgb(9,13,16);ForeColor=Ink;Font=new Font("Segoe UI",10);DoubleBuffered=true;
 LabelAt("H3X  /  SETUP",24,16,240,22,new Font("Consolas",9,FontStyle.Bold),Muted);
 var close=ButtonAt("×",740,6,36,34,false);close.Font=new Font("Segoe UI",17);close.Quiet=true;close.Click+=(s,e)=>{if(busy&&active!=null)active.CancelAsync();else Close();};
 LabelAt("H3X",34,111,170,67,new Font("Segoe UI",38,FontStyle.Bold),Ink);LabelAt("SEARCHER",37,181,165,27,new Font("Segoe UI",12,FontStyle.Bold),Accent);LabelAt("INTELLIGENCE\nWORKSPACE",39,225,150,53,new Font("Consolas",9),Muted);LabelAt("WINDOWS  /  X64",39,435,160,20,new Font("Consolas",9),Muted);
 LabelAt("Your workspace.\nReady to explore.",269,91,480,89,new Font("Segoe UI",25,FontStyle.Bold),Ink);LabelAt("Search sources. Connect leads. Keep context.",272,191,460,25,new Font("Segoe UI",10),Muted);
 version=LabelAt("CHECKING RELEASE",291,253,410,24,new Font("Consolas",10,FontStyle.Bold),Ink);size=LabelAt("GitHub · "+Repo,291,282,410,21,new Font("Segoe UI",9),Muted);
 install=ButtonAt("Install H3X Searcher  →",271,333,468,49,true);install.Enabled=false;repair=ButtonAt("Repair / Update",271,394,228,40,false);uninstall=ButtonAt("Uninstall",511,394,228,40,false);uninstall.Quiet=true;
 LabelAt("RELEASE STATUS",272,458,330,17,new Font("Consolas",8),Muted);status=LabelAt("Connecting to GitHub…",272,480,460,21,new Font("Segoe UI",10),Ink);detail=LabelAt("",272,507,460,29,new Font("Segoe UI",8),Muted);
 progress=new TransferBar{Location=new Point(272,445),Size=new Size(467,4)};Controls.Add(progress);cancel=ButtonAt("Cancel download",590,454,150,23,false);cancel.Quiet=true;cancel.Font=new Font("Segoe UI",8);cancel.Visible=false;
 install.Click+=async(s,e)=>await DownloadInstall();repair.Click+=async(s,e)=>await DownloadInstall();uninstall.Click+=(s,e)=>Uninstall();cancel.Click+=(s,e)=>{if(active!=null)active.CancelAsync();};if(!preview)Shown+=async(s,e)=>await RefreshRelease();FormClosing+=(s,e)=>{if(busy){if(active!=null)active.CancelAsync();e.Cancel=true;}};}
 Label LabelAt(string text,int x,int y,int w,int h,Font f,Color c){var l=new Label{Text=text,Location=new Point(x,y),Size=new Size(w,h),Font=f,ForeColor=c,BackColor=Color.Transparent};Controls.Add(l);return l;}
 ActionButton ButtonAt(string text,int x,int y,int w,int h,bool primary){var b=new ActionButton{Text=text,Location=new Point(x,y),Size=new Size(w,h),Font=new Font("Segoe UI",10,FontStyle.Bold),ForeColor=Ink,Primary=primary};Controls.Add(b);return b;}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;using(var b=new LinearGradientBrush(new Rectangle(0,45,232,505),Color.FromArgb(18,28,33),Color.FromArgb(9,15,19),90))g.FillRectangle(b,0,45,232,505);using(var pen=new Pen(Color.FromArgb(37,48,55))){g.DrawLine(pen,232,45,232,550);g.DrawLine(pen,0,44,790,44);g.DrawRectangle(pen,0,0,Width-1,Height-1);}using(var p=Round(new Rectangle(271,237,468,79),10))using(var b=new SolidBrush(Color.FromArgb(18,25,30)))g.FillPath(b,p);using(var pen=new Pen(Color.FromArgb(34,52,58)))for(int i=0;i<6;i++)g.DrawArc(pen,-90-i*10,300+i*12,300,300,210,110);}
 [DllImport("user32.dll")]static extern bool ReleaseCapture();[DllImport("user32.dll")]static extern IntPtr SendMessage(IntPtr h,int m,int w,int l);
 protected override void OnMouseDown(MouseEventArgs e){base.OnMouseDown(e);if(e.Button==MouseButtons.Left&&e.Y<45){ReleaseCapture();SendMessage(Handle,0xA1,2,0);}}
 void Busy(bool b){busy=b;install.Enabled=repair.Enabled=uninstall.Enabled=!b;cancel.Visible=b;}
 void Say(string text,string sub,bool error){status.Text=text;status.ForeColor=error?Color.FromArgb(239,169,145):Ink;detail.Text=sub;}
 static WebClient Client(){var c=new WebClient();c.Headers["User-Agent"]="H3X-Searcher-Setup/0.2.2";return c;}
 static string DownloadUrl(object value){var s=value as string;Uri u;if(!Uri.TryCreate(s,UriKind.Absolute,out u)||u.Scheme!="https"||u.Host!="github.com"||!u.AbsolutePath.StartsWith("/"+Repo+"/releases/download/",StringComparison.Ordinal))throw new Exception("Release asset has an unexpected download address.");return s;}
 internal static ReleaseInfo ParseRelease(string raw){var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(raw);object list;if(!data.TryGetValue("assets",out list)||!(list is IEnumerable)||list is string)throw new Exception("GitHub release has no asset list.");ReleaseInfo info=null;string sums=null;
 // Generic deserialization returns ArrayList on .NET Framework. IEnumerable also supports object[].
 foreach(object entry in (IEnumerable)list){var a=entry as Dictionary<string,object>;if(a==null||!a.ContainsKey("name"))continue;var name=Convert.ToString(a["name"]);if(Regex.IsMatch(name,@"^H3X-Searcher-Setup-\d+\.\d+\.\d+-x64\.exe$"))info=new ReleaseInfo{Name=name,Version=Convert.ToString(data["tag_name"]),Url=DownloadUrl(a["browser_download_url"]),Size=Convert.ToInt64(a["size"])};if(name=="SHA256SUMS.txt")sums=DownloadUrl(a["browser_download_url"]);}
 if(info==null||sums==null)throw new Exception("The latest release needs a Windows installer and SHA256SUMS.txt.");info.ChecksumsUrl=sums;return info;}
 static async Task<ReleaseInfo> Latest(WebClient c){return ParseRelease(await c.DownloadStringTaskAsync("https://api.github.com/repos/"+Repo+"/releases/latest"));}
 void ShowRelease(ReleaseInfo r){release=r;version.Text="H3X SEARCHER  "+r.Version;size.Text="Windows x64  ·  "+(r.Size/1048576d).ToString("0.0")+" MB  ·  GitHub release";}
 async Task RefreshRelease(){try{using(var c=Client()){ShowRelease(await Latest(c));Say("Ready to install","The installer download is checked with SHA-256.",false);install.Enabled=true;}}catch(Exception){version.Text="H3X SEARCHER";Say("Could not check for a release","Check your connection. Click Install to try again.",true);install.Enabled=true;}}
 static string Hash(string file){using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();}
 static string ExpectedHash(string checks,string filename){var m=Regex.Match(checks,@"(?im)^([a-f0-9]{64})[ \t]+\*?"+Regex.Escape(filename)+@"[ \t]*\r?$");if(!m.Success)throw new Exception("No valid checksum was found for this installer.");return m.Groups[1].Value.ToLowerInvariant();}
 async Task DownloadInstall(){Busy(true);progress.Value=0;progress.Invalidate();try{using(active=Client()){
 Say("Checking the latest release…","Connecting securely to GitHub.",false);ShowRelease(await Latest(active));string expected=ExpectedHash(await active.DownloadStringTaskAsync(release.ChecksumsUrl),release.Name);var folder=Path.Combine(Path.GetTempPath(),"H3X-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);string file=Path.Combine(folder,release.Name);
 active.DownloadProgressChanged+=(s,e)=>{progress.Value=e.ProgressPercentage;progress.Invalidate();Say("Downloading installer  ·  "+e.ProgressPercentage+"%",(e.BytesReceived/1048576d).ToString("0.0")+" / "+(e.TotalBytesToReceive/1048576d).ToString("0.0")+" MB",false);};await active.DownloadFileTaskAsync(release.Url,file);Say("Checking the downloaded installer…","Verifying size and SHA-256 checksum.",false);if(new FileInfo(file).Length!=release.Size||await Task.Run(()=>Hash(file))!=expected)throw new Exception("Download verification failed. Please retry.");Process.Start(new ProcessStartInfo(file){UseShellExecute=true});Say("Verified installer opened","Follow the installation steps in the new window.",false);
 }}catch(OperationCanceledException){Say("Download cancelled","You can start again whenever you are ready.",false);}catch(WebException ex){Say(ex.Status==WebExceptionStatus.RequestCanceled?"Download cancelled":"Could not download the release","Check your connection and retry.",true);}catch(Exception ex){Say("Setup could not continue",ex.Message,true);}finally{active=null;Busy(false);}}
 void Uninstall(){try{string cmd=null;foreach(var root in new[]{Registry.CurrentUser,Registry.LocalMachine})foreach(var view in new[]{@"Software\Microsoft\Windows\CurrentVersion\Uninstall",@"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"})using(var key=root.OpenSubKey(view)){if(key==null)continue;foreach(string sub in key.GetSubKeyNames())using(var entry=key.OpenSubKey(sub)){if(entry!=null&&(string)entry.GetValue("DisplayName")=="H3X Searcher"){cmd=(string)entry.GetValue("UninstallString");break;}}}if(cmd==null)throw new Exception("H3X Searcher is not installed on this computer.");var m=Regex.Match(cmd,"^\\s*\"([^\"]+\\.exe)\"\\s*(.*)$",RegexOptions.IgnoreCase);if(!m.Success||!File.Exists(m.Groups[1].Value))throw new Exception("The uninstaller could not be found.");Process.Start(new ProcessStartInfo(m.Groups[1].Value,m.Groups[2].Value){UseShellExecute=true});Say("Uninstaller opened","Follow the steps in the new window.",false);}catch(Exception ex){Say("Unable to uninstall",ex.Message,true);}}
 static async Task Verify(string output){using(var c=Client()){var r=await Latest(c);string expected=ExpectedHash(await c.DownloadStringTaskAsync(r.ChecksumsUrl),r.Name);var file=output+".download";try{await c.DownloadFileTaskAsync(r.Url,file);string actual=Hash(file);if(actual!=expected||new FileInfo(file).Length!=r.Size)throw new Exception("Checksum mismatch");File.WriteAllText(output,new JavaScriptSerializer().Serialize(new{version=r.Version,asset=r.Name,size=r.Size,sha256=actual,verified=true}));}finally{if(File.Exists(file))File.Delete(file);}}}
 [STAThread]static void Main(string[] args){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();try{if(args.Length==2&&args[0]=="--verify-download"){Verify(args[1]).GetAwaiter().GetResult();return;}if(args.Length==2&&args[0]=="--preview"){using(var f=new Setup(true)){f.ShowRelease(new ReleaseInfo{Version="v0.2.2",Size=102346870});f.Say("Ready to install","The installer download is checked with SHA-256.",false);f.install.Enabled=true;f.Show();Application.DoEvents();using(var b=new Bitmap(f.Width,f.Height)){f.DrawToBitmap(b,f.ClientRectangle);b.Save(args[1]);}}return;}Application.Run(new Setup());}catch(Exception ex){if(args.Length==2)File.WriteAllText(args[1],"ERROR: "+ex);else MessageBox.Show(ex.Message,"H3X Setup");Environment.ExitCode=1;}}
}
