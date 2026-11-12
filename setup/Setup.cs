using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Windows.Forms;
using System.Drawing;
using System.Diagnostics;
using Microsoft.Win32;
class Setup : Form {
 const string Repo="lez337/H3X-v2";
 Label status=new Label(); Button install=new Button(),repair=new Button(),uninstall=new Button();
 Setup(){Text="H3X Searcher Setup";ClientSize=new Size(500,270);StartPosition=FormStartPosition.CenterScreen;FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;BackColor=Color.FromArgb(9,11,12);ForeColor=Color.White;Font=new Font("Segoe UI",10);
 var title=new Label{Text="H3X  SEARCHER",Font=new Font("Segoe UI",23,FontStyle.Bold),Location=new Point(28,25),Size=new Size(440,46)};Controls.Add(title);
 Controls.Add(new Label{Text="Windows desktop workspace",Location=new Point(30,78),Size=new Size(430,25),ForeColor=Color.Silver});
 Controls.Add(new Label{Text="Releases: github.com/"+Repo,Location=new Point(30,110),Size=new Size(450,25),ForeColor=Color.FromArgb(145,180,180)});
 AddButton(install,"Install",30);AddButton(repair,"Repair / Update",180);AddButton(uninstall,"Uninstall",330);
 status.Location=new Point(30,205);status.Size=new Size(440,50);status.Text="Ready. Internet access is needed for install and repair.";status.ForeColor=Color.Silver;Controls.Add(status);
 install.Click+=async(s,e)=>await DownloadInstall();repair.Click+=async(s,e)=>await DownloadInstall();uninstall.Click+=(s,e)=>Uninstall();}
 void AddButton(Button b,string text,int x){b.Text=text;b.Location=new Point(x,155);b.Size=new Size(140,36);b.FlatStyle=FlatStyle.Flat;b.BackColor=Color.FromArgb(30,39,42);b.ForeColor=Color.White;Controls.Add(b);}
 void Busy(bool b){install.Enabled=repair.Enabled=uninstall.Enabled=!b;}
 static WebClient Client(){var c=new WebClient();c.Headers["User-Agent"]="H3X-Searcher-Setup";return c;}
 async System.Threading.Tasks.Task DownloadInstall(){Busy(true);string folder=null;try{
 ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
 using(var c=Client()){
 status.Text="Checking the latest GitHub release...";
 var raw=await c.DownloadStringTaskAsync("https://api.github.com/repos/"+Repo+"/releases/latest");
 var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(raw);
 var assets=(object[])data["assets"];Dictionary<string,object> exe=null,sums=null;
 foreach(Dictionary<string,object> a in assets){string name=(string)a["name"];if(Regex.IsMatch(name,@"^H3X-Searcher-Setup-[\d.]+-x64\.exe$"))exe=a;if(name=="SHA256SUMS.txt")sums=a;}
 if(exe==null||sums==null)throw new Exception("Release is missing the installer or checksum file.");
 string nameExe=(string)exe["name"];folder=Path.Combine(Path.GetTempPath(),"H3X-Setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);string file=Path.Combine(folder,nameExe);
 c.DownloadProgressChanged+=(s,e)=>{status.Text="Downloading installer: "+e.ProgressPercentage+"%";};
 string checks=await c.DownloadStringTaskAsync((string)sums["browser_download_url"]);
 var match=Regex.Match(checks,@"(?im)^([a-f0-9]{64})\s+\*?"+Regex.Escape(nameExe)+@"\s*$");if(!match.Success)throw new Exception("Installer checksum was not found.");
 await c.DownloadFileTaskAsync((string)exe["browser_download_url"],file);
 status.Text="Verifying installer...";string hash;using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))hash=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","");
 if(!hash.Equals(match.Groups[1].Value,StringComparison.OrdinalIgnoreCase))throw new Exception("Installer checksum mismatch. Download was not launched.");
 Process.Start(new ProcessStartInfo(file){UseShellExecute=true});status.Text="Verified installer opened. Follow its installation steps.";
 }}catch(WebException ex){status.Text="GitHub release unavailable: "+ex.Message;}catch(Exception ex){status.Text=ex.Message;}finally{Busy(false);}}
 void Uninstall(){try{
 string cmd=null;foreach(var root in new[]{Registry.CurrentUser,Registry.LocalMachine})foreach(var view in new[]{@"Software\Microsoft\Windows\CurrentVersion\Uninstall",@"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"})using(var key=root.OpenSubKey(view)){if(key==null)continue;foreach(string sub in key.GetSubKeyNames())using(var entry=key.OpenSubKey(sub)){if((string)entry.GetValue("DisplayName")=="H3X Searcher"){cmd=(string)entry.GetValue("UninstallString");break;}}}
 if(cmd==null)throw new Exception("H3X Searcher is not installed.");var m=Regex.Match(cmd,"^\\s*\"([^\"]+\\.exe)\"\\s*(.*)$",RegexOptions.IgnoreCase);if(!m.Success||!File.Exists(m.Groups[1].Value))throw new Exception("Uninstaller was not found.");
 Process.Start(new ProcessStartInfo(m.Groups[1].Value,m.Groups[2].Value){UseShellExecute=true});status.Text="Uninstaller opened.";
 }catch(Exception ex){status.Text=ex.Message;}}
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new Setup());}
}
