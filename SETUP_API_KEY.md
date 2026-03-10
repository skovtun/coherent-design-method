# Setting Up Anthropic API Key

Coherent Design Method uses Anthropic Claude API for AI-powered code generation. Each user needs to configure their own API key.

## Why Do I Need an API Key?

Coherent uses Claude API to:
- Generate design system configurations from your requirements
- Create component code based on specifications
- Modify existing code based on natural language requests

The API key is required for these AI features to work.

## Getting Your API Key

1. **Sign up** at [console.anthropic.com](https://console.anthropic.com)
2. **Create an API key** in your account settings
3. **Copy the key** (you'll only see it once!)

## Setting Up the Key

### Option 1: .env File (Recommended)

Create a `.env` file in the directory where you run `coherent` commands:

```bash
# In your project directory
echo "ANTHROPIC_API_KEY=your_key_here" > .env
```

**Advantages:**
- Works automatically (CLI loads .env files)
- Can be added to .gitignore (never commit your key!)
- Works across all commands

### Option 2: Environment Variable

Export the key in your shell:

```bash
# For current session
export ANTHROPIC_API_KEY=your_key_here

# For permanent setup (add to ~/.zshrc or ~/.bashrc)
echo 'export ANTHROPIC_API_KEY=your_key_here' >> ~/.zshrc
source ~/.zshrc
```

### Option 3: Global .env File

Create a `.env` file in your home directory:

```bash
echo "ANTHROPIC_API_KEY=your_key_here" >> ~/.env
```

## Verification

Test that your key is loaded:

```bash
# Check if key is set
node -e "require('dotenv').config(); console.log(process.env.ANTHROPIC_API_KEY ? '✅ Key loaded' : '❌ Key not found')"
```

## Security Best Practices

1. **Never commit your API key to Git**
   - Add `.env` to `.gitignore`
   - Use `.env.example` for documentation

2. **Don't share your API key**
   - Each user should have their own key
   - Keys are tied to your Anthropic account

3. **Rotate keys if compromised**
   - Delete old keys in Anthropic console
   - Generate new ones

## Pricing

- **Free tier:** Available with usage limits
- **Paid plans:** For higher usage
- Check [Anthropic pricing](https://www.anthropic.com/pricing) for details

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not found"

**Solution:**
1. Verify the key is set: `echo $ANTHROPIC_API_KEY`
2. Check .env file exists: `ls -la .env`
3. Ensure .env is in the correct directory (where you run `coherent`)
4. Restart your terminal after exporting

### Error: "Invalid API key"

**Solution:**
1. Verify the key is correct (no extra spaces)
2. Check the key hasn't expired
3. Ensure you're using the correct key format

## Need Help?

- [Anthropic Documentation](https://docs.anthropic.com)
- [Coherent Troubleshooting Guide](./TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/skovtun/coherent-design-method/issues)
