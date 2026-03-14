
const PYTHON_API_URL = "https://blockchain-voting-system-1-w5i0.onrender.com"; 

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');

  // --- 1. MetaMask Connectivity Check ---
  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.request({ method: 'eth_accounts' })
      .then(accounts => {
        if (accounts.length > 0) {
          console.log("🦊 MetaMask already connected:", accounts[0]);
        } else {
          console.log("⚠️ MetaMask not connected yet. Will request on login.");
        }
      })
      .catch(err => console.warn("⚠️ MetaMask silent check failed:", err.message));
  } else {
    alert("MetaMask is required. Please install it.");
  }

  // --- 2. Login Logic ---
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault(); 

    const voter_id = document.getElementById('voter-id').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!voter_id || !password) {
      alert("Please enter both Voter ID and Password.");
      return;
    }

    try {
      // 🔹 Sending credentials to the LIVE Render Python API
      const response = await fetch(`${PYTHON_API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          voter_id: voter_id,
          password: password
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Invalid login credentials.');
      }

      const data = await response.json(); // data contains {token, role}

      // --- 3. MetaMask Authorization ---
      if (typeof window.ethereum === 'undefined') {
        alert("MetaMask is required to continue.");
        return;
      }

      let accounts = await window.ethereum.request({ method: 'eth_accounts' });
      let walletAddress = accounts[0];

      if (!walletAddress) {
        const reqAccounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        walletAddress = reqAccounts[0];
      }

      console.log("🔗 Using wallet:", walletAddress);

      // --- 4. Link Wallet to Aiven DB ---
      // This goes to your Node.js server (Relative path)
      try {
        const saveWalletResponse = await fetch(
          `/saveWallet?voter_id=${voter_id}&wallet_address=${walletAddress}`
        );
        const walletResult = await saveWalletResponse.json();

        if (walletResult.success) {
          console.log("✅ Wallet linked successfully.");
        }
      } catch (err) {
        console.warn("⚠️ Wallet save issue:", err.message);
      }

      // --- 5. Storage & Redirect ---
      localStorage.setItem('voter_id', voter_id);

      if (data.role === 'admin') {
        localStorage.setItem('jwtTokenAdmin', data.token);
        window.location.href = `/admin.html?Authorization=Bearer ${data.token}`;
      } else {
        localStorage.setItem('jwtTokenVoter', data.token);
        window.location.href = `/index.html?Authorization=Bearer ${data.token}`;
      }

    } catch (error) {
      console.error('❌ Login process failed:', error.message);
      alert("Login failed: " + error.message);
    }
  });
});