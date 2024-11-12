const url = 'https://tilnel.com:8088/active'; 

// 从 URL 获取文字信息
async function fetchText() {
    try {
        const response = await fetch(url);
        
        // 检查响应是否成功
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // 获取文字内容
        const text = await response.text();
        
        // 输出文字信息
        console.log('Fetched text:', text);
        
    } catch (error) {
        console.error('Failed to fetch text:', error);
    }
}

// 调用函数
fetchText();

