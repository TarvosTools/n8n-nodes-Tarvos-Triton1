const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '../examples/basic');
const workflows = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f))));
const transfer = workflows.find(w => w.nodes.some(n => n.name === 'Verify Result'));
const verify = new Function('$input', '$', transfer.nodes.find(n => n.name === 'Verify Result').parameters.jsCode);
function run(before, after, fee = 5000, err = null) {
  const values = {
    'Submit Devnet Transfer': { data: { signature: 'test-signature' } },
    'Prepare Devnet Transfer': { recipient: 'recipient', lamports: '1000000' },
    'Recipient Balance': { data: { lamports: String(after) } },
    'Confirm Transfer': { data: { confirmationStatus: 'finalized' } },
  };
  return verify({ first: () => ({ json: { data: {
    meta: { err, fee, preBalances: [before], postBalances: [after] },
    transaction: { signatures: ['test-signature'], message: { accountKeys: [{ pubkey: 'recipient' }] } },
  } } }) }, name => ({ first: () => ({ json: values[name] }) }));
}
test('portable basic templates contain no credential bindings and remain inactive', () => {
  assert.equal(workflows.length, 5);
  for (const w of workflows) {
    assert.equal(w.active, false);
    assert.equal(w.id, undefined);
    for (const n of w.nodes) assert.equal(n.credentials, undefined);
  }
});

test('personal wallet and signature inputs are blank in reusable examples', () => {
  for (const w of workflows) for (const n of w.nodes) {
    if (n.name === 'Your Inputs') for (const a of n.parameters.assignments.assignments)
      if (['walletAddress','signature'].includes(a.name)) assert.equal(a.value,'');
    if (n.type.endsWith('.tarvosSolanaWallet')) assert.equal(n.parameters.publicAddress,'');
  }
  assert.equal(transfer.nodes.find(n=>n.name==='Sender Balance').parameters.address,'');
  const worker=JSON.parse(fs.readFileSync(path.join(dir,'../monitoring/devnet-worker.json')));
  for (const n of worker.nodes) {
    assert.equal(n.credentials,undefined);
    if ('workerAddress' in n.parameters) assert.equal(n.parameters.workerAddress,'');
  }
});
test('transfer verifier supports an already funded recipient and repeated runs', () => {
  assert.equal(run(0, 1000000)[0].json.status, 'PASS');
  assert.equal(run(1000000, 2000000)[0].json.status, 'PASS');
  assert.equal(run(2000000, 3000000)[0].json.creditedLamports, '1000000');
});
test('transfer verifier rejects wrong amount, failed transaction and excessive fee', () => {
  assert.throws(() => run(1000000, 1000001), /expected amount/);
  assert.throws(() => run(1000000, 2000000, 10001), /fee exceeded/);
  assert.throws(() => run(1000000, 2000000, 5000, { InstructionError: [0, 'failure'] }), /not yet verified/);
});

test('transfer starter requires user input and constructs a transaction for those addresses', () => {
  const code = transfer.nodes.find(n => n.name === 'Prepare Devnet Transfer').parameters.jsCode;
  assert.throws(() => new Function('$input', '$', code)({}, () => ({first:()=>({json:{meta:{address:''}}})})), /Configure your own/);
  const { Keypair, VersionedTransaction, SystemInstruction, TransactionInstruction } = require('@solana/web3.js');
  const sender=Keypair.generate().publicKey, recipient=Keypair.generate().publicKey, blockhash=Keypair.generate().publicKey.toBase58();
  const run=new Function('$input','$',code.replace("const recipient = '';",`const recipient = '${recipient.toBase58()}';`));
  const result=run({first:()=>({json:{data:{value:{blockhash}}}})},()=>({first:()=>({json:{meta:{address:sender.toBase58()},data:{lamports:'2000000'}}})}))[0].json;
  const tx=VersionedTransaction.deserialize(Buffer.from(result.transaction,'base64'));
  assert.equal(tx.message.staticAccountKeys[0].toBase58(),sender.toBase58());
  assert.equal(tx.message.staticAccountKeys[1].toBase58(),recipient.toBase58());
  assert.equal(tx.message.recentBlockhash,blockhash);
  const i=tx.message.compiledInstructions[0];
  const decoded=SystemInstruction.decodeTransfer(new TransactionInstruction({programId:tx.message.staticAccountKeys[i.programIdIndex],keys:i.accountKeyIndexes.map((index)=>({pubkey:tx.message.staticAccountKeys[index],isSigner:index===0,isWritable:true})),data:Buffer.from(i.data)}));
  assert.equal(decoded.lamports,1000000n);
});
