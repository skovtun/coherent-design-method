<div class="container">
    <h1>Page heading</h1>
    @include('partials.inverse_button', ['label' => 'Cancel'])
    @include("partials/header_button", ['variant' => 'primary'])
    @include('partials.empty_state', ['title' => 'No results'])
</div>
