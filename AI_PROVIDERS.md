# AI Provider Configuration

Coherent Design Method supports multiple AI providers for code generation. You can use Claude, OpenAI/ChatGPT, or let Coherent automatically detect available providers.

## Supported Providers

### 1. Anthropic Claude (Default)
- **Provider:** `claude`
- **API Key:** `ANTHROPIC_API_KEY`
- **Get Key:** [console.anthropic.com](https://console.anthropic.com)
- **Models:** Claude 3.5 Sonnet (default)

### 2. OpenAI / ChatGPT
- **Provider:** `openai`
- **API Key:** `OPENAI_API_KEY`
- **Get Key:** [platform.openai.com](https://platform.openai.com)
- **Models:** GPT-4 Turbo (default), GPT-4o

### 3. Auto-Detection
- **Provider:** `auto`
- Automatically detects available API keys from environment
- Checks in order: OpenAI → Claude

## Configuration Methods

### Method 1: Environment Variables (Recommended)

**For Claude:**
```bash
export ANTHROPIC_API_KEY=your_key_here
```

**For OpenAI:**
```bash
export OPENAI_API_KEY=your_key_here
```

**For .env file:**
```bash
# .env
ANTHROPIC_API_KEY=your_key_here
# OR
OPENAI_API_KEY=your_key_here
```

### Method 2: Automatic Detection from IDE

If you're using **Cursor** or other IDEs with built-in AI:

Coherent automatically detects:
- `CURSOR_OPENAI_API_KEY` (Cursor IDE)
- `GITHUB_COPILOT_OPENAI_API_KEY` (GitHub Copilot)
- `OPENAI_API_KEY` (general OpenAI)

**Note:** Some IDEs may not expose API keys to environment. In that case, you'll need to set them manually.

### Method 3: Explicit Provider Selection

You can specify provider in config (future feature):
```json
{
  "aiProvider": "openai",
  "aiModel": "gpt-4-turbo"
}
```

## How Auto-Detection Works

Coherent checks environment variables in this order:

1. **OpenAI** (`OPENAI_API_KEY`, `CURSOR_OPENAI_API_KEY`)
2. **Claude** (`ANTHROPIC_API_KEY`)

First available provider is used. If none found, shows helpful error message.

## Using with Cursor

If you're using Cursor IDE with OpenAI:

1. **Check if key is available:**
   ```bash
   echo $CURSOR_OPENAI_API_KEY
   ```

2. **If available, Coherent will use it automatically**

3. **If not available, set manually:**
   ```bash
   export OPENAI_API_KEY=your_cursor_key
   ```

**Note:** Cursor may not expose API keys to child processes. In that case:
- Use Cursor's terminal settings to expose environment variables
- Or manually set `OPENAI_API_KEY` in your `.env` file

## Provider Comparison

| Feature | Claude | OpenAI |
|---------|--------|--------|
| Code Quality | Excellent | Excellent |
| Structured Output | Strong | Strong (with JSON mode) |
| Cost | Pay-per-use | Pay-per-use |
| Speed | Fast | Fast |
| Free Tier | Limited | Limited |

## Switching Providers

To switch providers, simply change the environment variable:

```bash
# Switch to OpenAI
unset ANTHROPIC_API_KEY
export OPENAI_API_KEY=your_key

# Switch back to Claude
unset OPENAI_API_KEY
export ANTHROPIC_API_KEY=your_key
```

## Troubleshooting

### "No API key found"

**Solution:**
1. Check environment variables: `env | grep API_KEY`
2. Verify `.env` file exists and is in correct directory
3. Restart terminal after setting variables

### "Provider not supported"

**Solution:**
- Ensure you're using supported provider (Claude or OpenAI)
- Check that required package is installed:
  - Claude: `@anthropic-ai/sdk` (included)
  - OpenAI: `openai` (install with `npm install openai`)

### "Cursor key not detected"

**Solution:**
- Cursor may not expose keys to child processes
- Set `OPENAI_API_KEY` manually in `.env` file
- Or use Cursor's environment variable settings

## Future Providers

Planned support for:
- **Gemini** (Google)
- **Local models** (Ollama, LM Studio)
- **Custom providers** (via plugin system)

## Security Notes

- **Never commit API keys** to Git
- **Use `.env` files** and add to `.gitignore`
- **Rotate keys** if compromised
- **Use environment variables** for production

## Need Help?

- [Setup API Key Guide](./SETUP_API_KEY.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/coherent-design/coherent/issues)
