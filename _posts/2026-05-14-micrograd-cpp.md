---
layout: post
title: "micrograd-cpp: Dynamic Autograd Engine in C++"
description: "Reimplementing Andrej Karpathy's autograd engine in modern C++ with dynamic DAG construction, reverse-mode backpropagation, and smart pointers."
date: 2026-05-14
---

<p>Most modern deep learning practitioners treat PyTorch's <code>.backward()</code> as a magic black box. To genuinely understand reverse-mode automatic differentiation and graph memory management, I reimplemented Andrej Karpathy's <code>micrograd</code> from scratch in modern C++ (C++20).</p>

<h2>The Dynamic Computation Graph</h2>
<p>Every scalar value in the system is represented by a <code>Value</code> struct containing its underlying float data, accumulated gradient, mathematical operator, and shared pointers to parent nodes in the directed acyclic graph (DAG):</p>

<pre><code>struct Value : public std::enable_shared_from_this&lt;Value&gt; {
    double data;
    double grad = 0.0;
    std::function&lt;void()&gt; _backward = []() {};
    std::vector&lt;std::shared_ptr&lt;Value&gt;&gt; prev;
    std::string op;

    // Operator overloads for +, *, pow, relu, tanh...
};</code></pre>

<h2>Reverse-Mode Backpropagation</h2>
<p>When calling <code>backward()</code> on a scalar output, the engine performs a topological sort using depth-first search (DFS) over the DAG to resolve execution ordering. Then, it traverses nodes in reverse topological order, evaluating the stored derivative closures:</p>

<pre><code>void Value::backward() {
    std::vector&lt;std::shared_ptr&lt;Value&gt;&gt; topo;
    std::unordered_set&lt;Value*&gt; visited;

    auto build_topo = [&amp;](auto&amp; self, const std::shared_ptr&lt;Value&gt;&amp; v) -&gt; void {
        if (!visited.insert(v.get()).second) return;
        for (const auto&amp; child : v-&gt;prev) {
            self(self, child);
        }
        topo.push_back(v);
    };

    build_topo(build_topo, shared_from_this());
    this-&gt;grad = 1.0;

    for (auto it = topo.rbegin(); it != topo.rend(); ++it) {
        (*it)-&gt;_backward();
    }
}</code></pre>

<h2>Neural Network Abstractions</h2>
<p>On top of raw autograd scalars, I implemented modular primitives:</p>
<ul>
  <li><code>Neuron(nin, nonlin=true)</code>: Vector of weights and a bias parameter.</li>
  <li><code>Layer(nin, nout)</code>: Collection of parallel neurons.</li>
  <li><code>MLP(nin, nouts)</code>: Multi-layer perceptron stacking sequential layers with support for forward passes, parameter collection, and zero-grad resets.</li>
</ul>

<p>The code is open source on <a href="https://github.com/vallabhvidy/micrograd-cpp" target="_blank" rel="noreferrer">GitHub</a>.</p>
