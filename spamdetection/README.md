# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Configuring the API URL

This app talks to the Node backend (see the root `README.md`) at a URL resolved in `constants/api.ts` from two Expo public env vars:

| Var | Used when | Default if unset |
|---|---|---|
| `EXPO_PUBLIC_ANDROIDAPI` | Running on Android | `http://10.0.2.2:3000` (the emulator's alias for your host machine) |
| `EXPO_PUBLIC_IOSAPI` | Running on iOS | `http://localhost:3000` |

Copy `.env.example` to `.env` to override them:

```bash
cp .env.example .env
```

The defaults work out of the box for the **Android emulator** and **iOS simulator** with a backend running locally on port 3000 - you'll see a console warning if you're relying on them, since they silently stop working in one common case:

- **Testing on a real physical device**: neither `10.0.2.2` nor `localhost` can reach your dev machine from a phone. Find your machine's LAN IP (`ipconfig` on Windows, `ifconfig`/`ip a` on macOS/Linux) and set it in `.env`, e.g. `EXPO_PUBLIC_ANDROIDAPI=http://192.168.1.5:3000`. Your phone and dev machine need to be on the same network.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
