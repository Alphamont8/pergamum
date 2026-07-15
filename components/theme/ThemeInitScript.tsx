export function ThemeInitScript() {
  const code = `(function(){try{var k='pergamum-theme';var p=localStorage.getItem(k)||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`
  return <script dangerouslySetInnerHTML={{ __html: code }} />
}
