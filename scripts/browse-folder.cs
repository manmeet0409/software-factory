using System;
using System.IO;
using System.Windows.Forms;

namespace SoftwareFactory {
    static class Program {
        [STAThread]
        static void Main(string[] args) {
            try {
                using (FolderBrowserDialog dialog = new FolderBrowserDialog()) {
                    dialog.Description = "Select Factory Working Directory";
                    dialog.ShowNewFolderButton = true;
                    
                    try {
                        var prop = dialog.GetType().GetProperty("AutoUpgradeEnabled");
                        if (prop != null) {
                            prop.SetValue(dialog, true, null);
                        }
                    } catch {}

                    if (args.Length > 0 && !string.IsNullOrEmpty(args[0]) && Directory.Exists(args[0])) {
                        dialog.SelectedPath = Path.GetFullPath(args[0]);
                    }

                    using (Form owner = new Form {
                        TopMost = true,
                        ShowInTaskbar = false,
                        StartPosition = FormStartPosition.CenterScreen,
                        WindowState = FormWindowState.Minimized
                    }) {
                        owner.Show();
                        owner.BringToFront();
                        if (dialog.ShowDialog(owner) == DialogResult.OK) {
                            Console.OutputEncoding = System.Text.Encoding.UTF8;
                            Console.WriteLine(dialog.SelectedPath);
                        }
                    }
                }
            } catch (Exception ex) {
                Console.Error.WriteLine(ex.Message);
            }
        }
    }
}
