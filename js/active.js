const url = 'https://s.tilnel.com/activity'; 

fetch(url, { mode: 'cors' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      document.getElementById('html-container').innerHTML =
          html;
    })
    .catch(error => {
      console.error('Failed to fetch HTML:', error);
      document.getElementById('html-container').innerText =
          'Failed to load content.';
    });
