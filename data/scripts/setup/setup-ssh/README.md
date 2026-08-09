# SSH, explained

You don't need to understand any of this to run the script. It's here for when
something breaks, or when you want to know what you just agreed to.

## The one idea

SSH replaces passwords with a **pair of files**.

- `~/.ssh/id_ed25519` — the **private key**. This one is you. It never leaves
  this Mac. Anyone who copies it can pretend to be you.
- `~/.ssh/id_ed25519.pub` — the **public key**. Harmless. You paste this into
  GitHub, a server, anywhere that should recognise you.

They're generated together and only work as a pair. The trick is that the
public key can verify a signature made by the private key, but can't produce
one. So a server can check it's really you without ever holding anything worth
stealing. If GitHub is breached, your public key leaking costs you nothing.

The rule that follows: **never send anyone the file without `.pub`.** Every
legitimate request is for the `.pub` one.

## The passphrase

When you create a key, you're asked for a passphrase. This encrypts the private
key file, so someone who copies it off your laptop still can't use it.

Typing it on every `git push` would be miserable, so macOS stores it in your
login Keychain. You unlock it once when you log into the Mac, and everything
after that is silent. That's what the script writes into `~/.ssh/config`:

```
Host *
  AddKeysToAgent yes      # load the key when it's first needed
  UseKeychain yes         # get the passphrase from the Keychain, not from you
  IdentityFile ~/.ssh/id_ed25519
```

The **agent** (`ssh-agent`) is a small background program holding your unlocked
key in memory so programs can use it without re-asking. `ssh-add -l` lists
what's loaded.

## What you'll actually use it for

**Pushing to GitHub without typing a password.** The most common one. Once your
public key is on your account, `git push` just works. GitHub stopped accepting
account passwords for git in 2021, so the alternative is juggling access tokens.

**Logging into a server.** `ssh you@some-server.com` drops you into a shell on
another machine. Put your public key in that server's `~/.ssh/authorized_keys`
and it stops asking for a password.

**Copying files between machines.** `scp report.pdf you@server:/tmp/` sends a
file over the same connection. `rsync` uses SSH underneath too, which is how
most backup scripts move data.

**Signing your commits.** Git can use your SSH key to prove a commit really
came from you — that's where GitHub's "Verified" badge comes from.

**Tunnelling a port.** `ssh -L 8080:localhost:80 you@server` makes the server's
port 80 appear at `localhost:8080` on your Mac. Handy for reaching a database
or an internal dashboard that isn't exposed to the internet.

## Running the script

```sh
deno run -A setup-ssh.ts --check     # look at everything, change nothing
deno run -A setup-ssh.ts             # create the key, write the config, load the agent
deno run -A setup-ssh.ts --no-test   # skip the live connection test to GitHub
```

**Create the key from a real Terminal, not the web console.** `ssh-keygen` has
to stop and ask you for a passphrase, and the console can only show you output
— it has no way to send your typing back. The script detects this and prints
the command to paste instead of hanging.

Afterwards, run the GitHub script (`setup-github`) — it checks whether the key
on this Mac is actually registered on your account, which is the step people
most often miss.

## Reading the output

The verify table asks **ssh itself** what it would do, via `ssh -G github.com`,
rather than re-reading the file that was just written. If a setting shows as
`unset` there, something else in your config is overriding it — most likely a
`Host *` block further up, since ssh keeps the *first* value it sees for most
settings. That's why the script puts its block at the top of the file.

The GitHub test looks strange if you run it by hand:

```sh
$ ssh -T git@github.com
Hi arfan! You've successfully authenticated, but GitHub does not provide shell access.
$ echo $?
1
```

Exit code 1, and that's the success case — GitHub never gives you a shell, so
it always closes the connection. The greeting is the real signal, which is why
the script reads the message rather than the exit code.

## Undoing it

Delete the lines between `# ── managed by setup-ssh ──` and
`# ── end setup-ssh ──` in `~/.ssh/config`. Your previous config was copied to
`~/.ssh/config.backup-<timestamp>` before anything was written.

To unload the key from the agent:

```sh
ssh-add -d ~/.ssh/id_ed25519
```

Deleting the key files themselves is safe only once you've removed the public
key from anywhere you registered it — otherwise you're leaving a lock with no
remaining copy of its key.

## When it goes wrong

**`Permission denied (publickey)`** — GitHub doesn't recognise your key. Almost
always because the public key was never uploaded. `gh ssh-key add
~/.ssh/id_ed25519.pub` fixes it, or paste it at
<https://github.com/settings/ssh/new>.

**`WARNING: UNPROTECTED PRIVATE KEY FILE`** — the key file is readable by other
accounts on the Mac and ssh refuses to use it. `chmod 600 ~/.ssh/id_ed25519`.
The script does this for you.

**Asked for the passphrase every single time** — `UseKeychain` isn't taking
effect. Run the script with `--check` and look at the Keychain row.

**`Host key verification failed`** — the server's identity changed since you
last connected. Usually a rebuilt server, occasionally something to worry
about. Remove the stale entry with `ssh-keygen -R hostname`.
