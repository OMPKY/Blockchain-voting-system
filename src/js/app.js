const Web3 = require('web3');
const contract = require('@truffle/contract');
const votingArtifacts = require('../../build/contracts/Voting.json');
var VotingContract = contract(votingArtifacts);

window.VotingContract = VotingContract;

// --- Live Sepolia Configuration ---
const LIVE_CONTRACT_ADDRESS = "0xd4e3D7b07428b9dC678df06e754926EEac3AABAe";
const INFURA_URL = "https://sepolia.infura.io/v3/07bd698e4b1640eda6169cd2bbfc10cb";

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
      // 1. Provider Setup & Auto Network Switcher
      if (typeof window.ethereum !== 'undefined') {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // --- AUTOMATIC NETWORK SWITCHER ---
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const sepoliaChainId = '0xaa36a7';

        if (chainId !== sepoliaChainId) {
          console.log("⚠️ Wrong network detected. Prompting user to switch...");
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: sepoliaChainId }],
            });
            console.log("✅ Successfully switched to Sepolia.");
          } catch (switchError) {
            if (switchError.code === 4902) {
              alert("Please add the Sepolia Testnet to your MetaMask.");
            } else {
              alert("You must switch to the Sepolia network in MetaMask to use this application.");
            }
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

      // 2. Account Check
      App.account = (window.ethereum && window.ethereum.selectedAddress) || (await window.eth.eth.getAccounts())[0];
      
      if (App.account) {
          VotingContract.defaults({ from: App.account, gas: 1000000 }); 
      }

      // 3. Robust Instance Loading
      let instance;
      try {
          const code = await window.eth.eth.getCode(LIVE_CONTRACT_ADDRESS);
          if (code === '0x' || code === '0x0') {
              throw new Error("MetaMask is not on Sepolia. Please switch networks.");
          }
          instance = await VotingContract.at(LIVE_CONTRACT_ADDRESS);
      } catch (e) {
          console.warn("Retrying contract connection in 2s...");
          await new Promise(res => setTimeout(res, 2000));
          instance = await VotingContract.at(LIVE_CONTRACT_ADDRESS);
      }

      window.VotingInstance = instance;
      console.log("✅ Voting contract loaded live at:", instance.address);

      renderAdminCandidatesBox();

      // 4. Wallet Link Logic 
      const voter_id = localStorage.getItem("voter_id");
      if (voter_id && App.account) {
        try {
          const saveResponse = await fetch(`/saveWallet?voter_id=${encodeURIComponent(voter_id)}&wallet_address=${encodeURIComponent(App.account)}`);
          const saveData = await saveResponse.json();
          console.log("💾 Database Save Status:", saveData);

          if (saveData.error === 'ER_DUP_ENTRY' || (saveData.message && saveData.message.toLowerCase().includes('duplicate'))) {
             alert("⚠️ URGENT WARNING: This MetaMask account is already registered! \n\nPlease switch accounts and refresh.");
             $("#msg").html("<p style='color:red;'>⚠️ Wallet belongs to another voter.</p>");
          }
        } catch (e) { console.warn("Wallet link skipped:", e.message); }
      }

      // 5. Admin Actions
      if ($('#addCandidate').length) {
        $('#addCandidate').off('click').on('click', async function () {
          const $status = $(this).closest('.container').find('#Aday'); 
          const nameCandidate = $('#name').val()?.trim(), partyCandidate = $('#party').val()?.trim();
          if (!nameCandidate || !partyCandidate) {
            $status.html("<span style='color:red;'>Fill all details!</span>");
            return;
          }
          $status.html("<span style='color:lime;'>Confirm in MetaMask...</span>");
          try {
            const receipt = await instance.addCandidate(nameCandidate, partyCandidate);
            if (txOk(receipt)) {
              $status.html("<span style='color:lime;'>✅ Candidate added!</span>");
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
            if (!sIn || !eIn) { $status.html("<span style='color:red;'>Select dates!</span>"); return; }
            const sTs = Math.floor(new Date(`${sIn}T00:00:00`).getTime() / 1000);
            const eTs = Math.floor(new Date(`${eIn}T23:59:59`).getTime() / 1000);
            $status.html("<span style='color:lime;'>Setting dates...</span>");
            const receipt = await instance.setDates(sTs, eTs);
            if (txOk(receipt)) {
              $status.html("<span style='color:lime;'>✅ Dates set!</span>");
              setTimeout(() => location.reload(), 800);
            }
          } catch (err) { $status.html("<span style='color:red;'>Failed to set dates.</span>"); }
        });
      }

      // Show current dates
      if ($('#dates').length) {
        try {
          const dates = await instance.getDates();
          const s = toNum(dates[0]), e = toNum(dates[1]);
          if (s && e) $('#dates').text(`${new Date(s*1000).toDateString()} - ${new Date(e*1000).toDateString()}`);
        } catch (err) { console.error("Get dates failed."); }
      }

      // 6. Voter Logic (List generation)
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

      // 7. Check if already voted
      if ($('#voteButton').length) {
        try {
          const hasVoted = await instance.checkVote();
          if (hasVoted) {
            $("#voteButton").attr("disabled", true);
            $("#msg").html("<p style='color:red;'>⚠️ You have already voted.</p>");
          }
        } catch (e) { console.warn('checkVote failed:', e); }
      }

      $('#refreshAdminCandidates').off('click').on('click', function () {
        renderAdminCandidatesBox();
      });

      // 🔹 8. ADDED LOGOUT HANDLER 
      $('.logout, #logout, .btn-logout').on('click', function (e) {
          e.preventDefault();
          console.log("🚪 Logging out...");
          localStorage.clear(); // Wipe the JWT tokens and Voter ID
          window.location.replace("/"); // Redirect to live homepage
      });

    } catch (err) {
      console.error("Initialization Error:", err.message);
    }
  },

  vote: async function () {
    const candidateID = $("input[name='candidate']:checked").val();
    if (!candidateID) {
      $("#msg").html("<p style='color:red;'>⚠️ Please select a candidate.</p>");
      return;
    }

    try {
      if (!window.ethereum) return;
      let accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const currentWallet = accounts[0];

      const voter_id = localStorage.getItem("voter_id");
      if (!voter_id) {
        alert("Session expired.");
        window.location.replace("/");
        return;
      }

      const instance = window.VotingInstance || await VotingContract.at(LIVE_CONTRACT_ADDRESS);

      // Verify wallet against Backend
      const verifyResponse = await fetch(`/checkWallet?voter_id=${encodeURIComponent(voter_id)}`);
      const verifyData = await verifyResponse.json();
      const dbWallet = verifyData.wallet_address || verifyData.wallet;

      if (!dbWallet || dbWallet.toLowerCase() !== currentWallet.toLowerCase()) {
        $("#msg").html("<p style='color:red;'>🚫 Unauthorized wallet!</p>");
        return;
      }

      // Cast vote
      $("#msg").html("<p style='color:lime;'>Casting vote... Confirm in MetaMask.</p>");
      try {
        const receipt = await instance.vote(parseInt(candidateID, 10), { from: currentWallet });
        $("#voteButton").attr("disabled", true);
        $("#msg").html("<p>✅ Vote cast successfully!</p>");
        setTimeout(() => location.reload(), 2000);
      } catch (err) {
        $("#msg").html("<p style='color:red;'>❌ Voting failed.</p>");
      }

    } catch (err) {
      $("#msg").html("<p style='color:red;'>Error during voting.</p>");
    }
  }
};

// Account change
if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => window.location.reload());
}

// Init
window.addEventListener("load", () => window.App.eventStart());