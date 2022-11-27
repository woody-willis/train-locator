const navbarHtml = `<div class="navbar">
    <ul>
        <li><a href="index.html">Home</a></li>
        <li><a href="login.html">Login</a></li>
        <li><a href="premium.html">Buy Premium</a></li>
    </ul>
</div>`;

document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = navbarHtml + document.body.innerHTML;
});