(() => {
  "use strict";
  const script=document.createElement("script");
  script.src="./app.js?v=11";
  script.defer=true;
  script.onerror=()=>{
    document.body.innerHTML="<p style='padding:30px'>Không tải được ứng dụng Aptis v5.1.</p>";
  };
  document.body.appendChild(script);
})();
