const url = 'https://s.tilnel.com/activity'; // 将这个 URL 替换为你实际的 URL

// 使用 fetch API 获取文字并显示在网页中
fetch(url, { mode: 'no-cors' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      document.getElementById('html-container').innerHTML =
          html; // 将 HTML 内容插入到 html-container 中
    })
    .catch(error => {
      console.error('Failed to fetch HTML:', error);
      document.getElementById('html-container').innerText =
          'Failed to load content.';
    });
