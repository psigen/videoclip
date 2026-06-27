export function Terms() {
  return (
    <div className="app terms">
      <header>
        <h1>Terms of Service</h1>
        <p className="tagline">
          Short version: this app is provided as-is, you use it at your own risk, and your content
          stays yours.
        </p>
      </header>

      <section className="card prose">
        <h2>Acceptance</h2>
        <p>
          By using VideoClip (the &ldquo;app&rdquo;) you agree to these terms. If you do not agree,
          please do not use the app.
        </p>

        <h2>The app is provided &ldquo;as is&rdquo;</h2>
        <p>
          VideoClip is a free, open-source, client-side tool offered without warranty of any kind,
          express or implied, including but not limited to warranties of merchantability, fitness for
          a particular purpose, and non-infringement. The app makes no guarantee that it will be
          available, error-free, or that any clip it produces will meet your needs or preserve the
          quality of your source material.
        </p>

        <h2>Your content remains yours</h2>
        <p>
          The app claims <strong>no ownership of and no rights to</strong> any video, image, audio,
          or other content you load or create with it. Because all processing happens locally in your
          browser, your content is never transmitted to or stored by the app or its creator. You
          retain full rights to your material; we acquire none. See the{' '}
          <a href="#/privacy">Privacy page</a> for details on how data is (and is not) handled.
        </p>

        <h2>Your responsibilities</h2>
        <ul>
          <li>
            You are solely responsible for the content you process and for ensuring you have the
            rights to use it, including any copyright, trademark, privacy, or publicity rights of
            others.
          </li>
          <li>
            You agree to use the app only for lawful purposes and in compliance with all applicable
            laws and regulations.
          </li>
          <li>
            When you use the optional Google Drive integration, you are also bound by Google&rsquo;s
            terms; your interaction with Google&rsquo;s services is between you and Google.
          </li>
        </ul>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, in no event will the creator of this app be liable
          for any direct, indirect, incidental, special, consequential, or exemplary damages —
          including loss of data, loss of profits, or business interruption — arising out of or in
          connection with your use of, or inability to use, the app, even if advised of the
          possibility of such damages. Your sole and exclusive remedy is to stop using the app.
        </p>

        <h2>Indemnification</h2>
        <p>
          You agree to indemnify, defend, and hold harmless the creator of this app from and against
          any and all claims, liabilities, damages, losses, and expenses (including reasonable legal
          fees) arising out of or in any way connected with your use of the app or your violation of
          these terms or of any applicable law or the rights of any third party.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          These terms may be updated from time to time. Continued use of the app after any change
          constitutes acceptance of the revised terms.
        </p>
      </section>

      <footer>
        <a href="#/">← Back to the app</a>
      </footer>
    </div>
  );
}
