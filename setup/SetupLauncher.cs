using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class SetupLauncher {
    [STAThread]
    private static int Main(string[] args) {
        string folder = Path.Combine(Path.GetTempPath(), "H3X-Setup-UI-" + Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(folder);
            foreach (string name in new [] { "H3X-Setup.ps1", "setup-icon.png", "setup-config.json" }) {
                using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                using (FileStream output = File.Create(Path.Combine(folder, name))) { input.CopyTo(output); }
            }
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe");
            string extra = "";
            if (args.Length != 0) {
                if (args.Length != 2 || args[0] != "--verify-download" || args[1].Contains("\"")) throw new ArgumentException("Expected --verify-download followed by a report path.");
                extra = " -VerifyDownload -VerificationPath \"" + Path.GetFullPath(args[1]) + "\"";
            }
            var start = new ProcessStartInfo(powershell, "-NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + Path.Combine(folder, "H3X-Setup.ps1") + "\"" + extra);
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            start.RedirectStandardError = true;
            // Let Windows PowerShell initialize its own module paths, including when launched by pwsh.
            start.EnvironmentVariables.Remove("PSModulePath");
            using (Process process = Process.Start(start)) {
                string error = process.StandardError.ReadToEnd();
                process.WaitForExit();
                if (process.ExitCode != 0 && args.Length == 0) MessageBox.Show("Setup could not start.\n\n" + error, "H3X / SETUP", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return process.ExitCode;
            }
        } catch (Exception error) {
            if (args.Length == 0) MessageBox.Show(error.Message, "H3X / SETUP", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        } finally {
            // Delete only the three known resources extracted by this process.
            foreach (string name in new [] { "H3X-Setup.ps1", "setup-icon.png", "setup-config.json" }) {
                try { File.Delete(Path.Combine(folder, name)); } catch { }
            }
            try { Directory.Delete(folder); } catch { }
        }
    }
}
