const url = 'http://tilnel.com:8088/text'; // 将这个 URL 替换为你实际的 URL

// 使用 fetch API 获取文字并显示在网页中
fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then(text => {
      document.getElementById('text-container').innerText =
          text; // 将文字内容插入到 text-container 中
    })
    .catch(error => {
      console.error('Failed to fetch text:', error);
      document.getElementById('text-container').innerText =
          'Failed to load text.';
    });
