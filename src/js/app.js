const Web3 = require('web3');
const contract = require('@truffle/contract');
const votingArtifacts = require('../../build/contracts/Voting.json');
var VotingContract = contract(votingArtifacts);

window.VotingContract = VotingContract;

// --- Live Sepolia Configuration ---
const LIVE_CONTRACT_ADDRESS = "0x662EDbAe308D3F25c254D9e099bf96B8a6122246";
const INFURA_URL = "https://ethereum-sepolia-rpc.publicnode.com";

function toNum(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') return Number(x);
  if (typeof x.toNumber === 'function') return x.toNumber();
  return Number(x);
}

function txOk(r) {
  const s = r?.receipt?.status;
  return s === true || (typeof s === 'string' && s.toLowerCase().endsWith('1'));
}

// Render admin candidates list
async function renderAdminCandidatesBox() {
  const $tbody = $('#adminCandidatesBody');
  const $msg = $('#adminCandidatesMsg');
  if (!$tbody.length) return;

  try {
    const instance = window.VotingInstance || await VotingContract.at(LIVE_CONTRACT_ADDRESS);
    $tbody.empty();

    const countCandidates = await instance.getCountCandidates();
    const total = toNum(countCandidates);

    for (let i = 1; i <= total; i++) {
      const data = await instance.getCandidate(i);
      const id = data[0], name = data[1], party = data[2], voteCount = data[3];

      $tbody.append(`
        <tr>
          <td>${id}</td>
          <td>${name}</td>
          <td>${party}</td>
          <td>${voteCount}</td>
        </tr>`);
    }

    if ($msg.length) $msg.text(`Showing ${total} candidate(s).`);
  } catch (err) {
    console.error('Admin list load failed:', err?.message || err);
    if ($msg.length) $msg.text('Failed to load candidates. See console.');
  }
}

window.App = {
  account: null,

  eventStart: async function () {
    try {
      if (typeof window.ethereum !== 'undefined') {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const sepoliaChainId = '0xaa36a7';

        if (chainId !== sepoliaChainId) {
          console.log("⚠️ Wrong network detected. Prompting user to switch...");
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: sepoliaChainId }],
            });
          } catch (switchError) {
            alert("Please switch to the Sepolia Testnet in your MetaMask.");
            return; 
          }
        }
        window.eth = new Web3(window.ethereum);
        VotingContract.setProvider(window.ethereum);
      } else {
        const provider = new Web3.providers.HttpProvider(INFURA_URL);
        window.eth = new Web3(provider);
        VotingContract.setProvider(provider);
      }

      App.account = (window.ethereum && window.ethereum.selectedAddress) || (await window.eth.eth.getAccounts())[0];
      if (App.account) {
          VotingContract.defaults({ from: App.account, gas: 1000000 }); 
      }

      let instance = await VotingContract.at(LIVE_CONTRACT_ADDRESS);
      window.VotingInstance = instance;

      renderAdminCandidatesBox();
      const voter_id = localStorage.getItem("voter_id");

      // Admin Actions
      if ($('#addCandidate').length) {
        $('#addCandidate').off('click').on('click', async function () {
          const $status = $(this).closest('.container').find('#Aday'); 
          const nameCandidate = $('#name').val()?.trim(), partyCandidate = $('#party').val()?.trim();
          if (!nameCandidate || !partyCandidate) return $status.html("<span style='color:red;'>Fill all details!</span>");
          
          $status.html("<span style='color:lime;'>Confirm in MetaMask...</span>");
          try {
            const receipt = await instance.addCandidate(nameCandidate, partyCandidate);
            if (txOk(receipt)) {
              const txHash = receipt.tx; 
              $status.html(`
                <span style='color:lime;'>✅ Candidate added!</span><br>
                <span style='font-size: 12px;'>🧾 <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" style="color: #007bff; text-decoration: underline;">Verify on Etherscan</a></span>
              `);
              $('#name').val(''); $('#party').val('');
              renderAdminCandidatesBox();
            }
          } catch (err) { $status.html("<span style='color:red;'>Transaction failed.</span>"); }
        });
      }

      if ($('#addDate').length) {
        $('#addDate').off('click').on('click', async function () {
          const $status = $(this).closest('.container').find('#Aday');
          try {
            const sIn = document.getElementById("startDate").value, eIn = document.getElementById("endDate").value;
            if (!sIn || !eIn) return $status.html("<span style='color:red;'>Select dates!</span>"); 
            const sTs = Math.floor(new Date(`${sIn}T00:00:00`).getTime() / 1000);
            const eTs = Math.floor(new Date(`${eIn}T23:59:59`).getTime() / 1000);
            
            $status.html("<span style='color:lime;'>Setting dates...</span>");
            const receipt = await instance.setDates(sTs, eTs);
            if (txOk(receipt)) {
              const txHash = receipt.tx;
              $status.html(`
                <span style='color:lime;'>✅ Dates set!</span><br>
                <span style='font-size: 12px;'>🧾 <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" style="color: #007bff; text-decoration: underline;">Verify on Etherscan</a></span>
              `);
              setTimeout(() => location.reload(), 5000); 
            }
          } catch (err) { $status.html("<span style='color:red;'>Failed to set dates.</span>"); }
        });
      }

      if ($('#dates').length) {
        try {
          const dates = await instance.getDates();
          const s = toNum(dates[0]), e = toNum(dates[1]);
          if (s && e) $('#dates').text(`${new Date(s*1000).toDateString()} - ${new Date(e*1000).toDateString()}`);
        } catch (err) { console.error("Get dates failed."); }
      }

      if ($('#boxCandidate').length) {
        try {
          const count = toNum(await instance.getCountCandidates());
          for (let i=1; i<=count; i++) {
            const data = await instance.getCandidate(i);
            $('#boxCandidate').append(`
              <tr>
                <td><input class="form-check-input" type="radio" name="candidate" value="${toNum(data[0])}"> ${data[1]}</td>
                <td>${data[2]}</td>
                <td>${toNum(data[3])}</td>
              </tr>`);
          }
        } catch (e) { console.error('Load candidates failed.'); }
      }

      // 🔹 UI LOCKOUT CHECKS
      if ($('#voteButton').length && voter_id) {
        $("#voteButton").prop("disabled", true); 

        try {
          const verifyResponse = await fetch(`/checkWallet?voter_id=${encodeURIComponent(voter_id)}`);
          const textData = await verifyResponse.text();
          console.log("DB Raw Data:", textData); // Prints to F12 Console for debugging
          
          let verifyData = {};
          try { verifyData = JSON.parse(textData); } catch(e) {}

          // 🔹 THE FIX: Safely extract whether it's an Array or Object
          let dbWallet = null;
          if (Array.isArray(verifyData) && verifyData.length > 0) {
              dbWallet = verifyData[0].wallet_address || verifyData[0].wallet;
          } else if (verifyData && !Array.isArray(verifyData)) {
              dbWallet = verifyData.wallet_address || verifyData.wallet;
          }

          if (!dbWallet || dbWallet === "null" || dbWallet === "") {
             $("#msg").html("<p style='color:red;'>⚠️ Your wallet is not registered for voting. Please contact the Admin.</p>");
          } 
          else if (dbWallet.toLowerCase() !== App.account.toLowerCase()) {
             $("#msg").html("<p style='color:red;'>🚫 This MetaMask wallet is registered to another user. Please switch to your registered wallet.</p>");
          } 
          else {
            const hasVoted = await instance.checkVote({ from: App.account });
            if (hasVoted) {
              const savedHash = localStorage.getItem(`txHash_${App.account.toLowerCase()}`);
              if (savedHash) {
                $("#msg").html(`
                  <p style='color:red;'>⚠️ You have already voted.</p>
                  <p style='font-size: 14px;'>🧾 Blockchain Receipt: <a href="https://sepolia.etherscan.io/tx/${savedHash}" target="_blank" style="color: #007bff; text-decoration: underline;">${savedHash.substring(0, 15)}...</a></p>
                  <p style='font-size: 12px; color: #666;'>(Click to verify on Etherscan)</p>
                `);
              } else {
                $("#msg").html("<p style='color:red;'>⚠️ You have already voted.</p>");
              }
            } else {
              $("#voteButton").prop("disabled", false); 
            }
          }
        } catch (e) { 
          console.warn("State check error:", e);
          $("#voteButton").prop("disabled", false); 
        }
      }

      $('#refreshAdminCandidates').off('click').on('click', function () { renderAdminCandidatesBox(); });

      $('.logout, #logout, .btn-logout, #logoutBtn').on('click', function (e) {
          e.preventDefault();
          localStorage.clear(); 
          window.location.replace("/"); 
      });

    } catch (err) { console.error("Initialization Error:", err.message); }
  },

  vote: async function () {
    const candidateID = $("input[name='candidate']:checked").val();
    if (!candidateID) return $("#msg").html("<p style='color:red;'>⚠️ Please select a candidate.</p>");

    try {
      if (!window.ethereum) return $("#msg").html("<p style='color:red;'>❌ MetaMask not detected.</p>");
      
      let accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const currentWallet = accounts[0];

      const voter_id = localStorage.getItem("voter_id");
      if (!voter_id) {
        alert("Session expired.");
        window.location.replace("/");
        return;
      }

      const instance = window.VotingInstance || await VotingContract.at(LIVE_CONTRACT_ADDRESS);

      // Verify DB on Click
      try {
        const verifyResponse = await fetch(`/checkWallet?voter_id=${encodeURIComponent(voter_id)}`);
        const textData = await verifyResponse.text();
        let verifyData = {};
        try { verifyData = JSON.parse(textData); } catch(e) {}

        // 🔹 THE FIX
        let dbWallet = null;
        if (Array.isArray(verifyData) && verifyData.length > 0) {
            dbWallet = verifyData[0].wallet_address || verifyData[0].wallet;
        } else if (verifyData && !Array.isArray(verifyData)) {
            dbWallet = verifyData.wallet_address || verifyData.wallet;
        }

        if (!dbWallet || dbWallet === "null" || dbWallet === "") {
          $("#msg").html("<p style='color:red;'>⚠️ Your wallet is not registered for voting. Please contact the Admin.</p>");
          return;
        }
        if (dbWallet.toLowerCase() !== currentWallet.toLowerCase()) {
          $("#msg").html("<p style='color:red;'>🚫 This MetaMask wallet is registered to another user. Please switch to your registered wallet.</p>");
          return;
        }
      } catch(e) { console.warn("Wallet check bypassed or backend offline."); }

      // Dates Check
      try {
        const dates = await instance.getDates();
        const startTs = toNum(dates[0]), endTs = toNum(dates[1]), nowTs = Math.floor(Date.now() / 1000);
        
        if (!startTs || !endTs || startTs === 0 || endTs === 0) return $("#msg").html("<p style='color:red;'>❌ Voting dates are not set yet.</p>");
        if (nowTs < startTs) return $("#msg").html(`<p style='color:red;'>❌ Voting hasn't started yet.</p>`);
        if (nowTs >= endTs) return $("#msg").html(`<p style='color:red;'>❌ Voting has ended.</p>`);
      } catch (e) { return $("#msg").html("<p style='color:red;'>❌ Cannot verify voting dates.</p>"); }

      $("#msg").html("<p style='color:lime;'>Casting vote... Confirm in MetaMask.</p>");
      try {
        const receipt = await instance.vote(parseInt(candidateID, 10), { from: currentWallet });
        const txHash = receipt.tx;
        
        localStorage.setItem(`txHash_${currentWallet.toLowerCase()}`, txHash);
        $("#voteButton").prop("disabled", true);
        $("#msg").html(`
          <p style='color:lime;'>✅ Vote cast successfully!</p>
          <p style='font-size: 14px;'>🧾 Blockchain Receipt: <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" style="color: #007bff; text-decoration: underline;">${txHash.substring(0, 15)}...</a></p>
          <p style='font-size: 12px; color: #666;'>(Click to verify your vote on Etherscan)</p>
        `);
        setTimeout(() => location.reload(), 10000); 

      } catch (err) { $("#msg").html("<p style='color:red;'>❌ Voting failed or was rejected.</p>"); }
    } catch (err) { $("#msg").html("<p style='color:red;'>Error during voting process.</p>"); }
  }
};

if (window.ethereum) window.ethereum.on('accountsChanged', () => window.location.reload());
window.addEventListener("load", () => window.App.eventStart());