import react from '@vitejs/plugin-react-swc'

export default {
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
}
