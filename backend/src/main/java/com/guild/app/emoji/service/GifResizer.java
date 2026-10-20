package com.guild.app.emoji.service;

import org.w3c.dom.Node;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Crops and/or shrinks an animated GIF to a square, keeping every frame and its timing.
 * Frames are composited like a browser does (offsets + disposal methods), so partial frames
 * of optimized GIFs come out whole; each output frame is a full image.
 */
final class GifResizer {

    private static final String IMAGE_FORMAT = "javax_imageio_gif_image_1.0";
    private static final String STREAM_FORMAT = "javax_imageio_gif_stream_1.0";
    /** Guards against decompression bombs: a small file can declare a huge canvas or thousands of frames. */
    private static final int MAX_FRAMES = 500;
    private static final int MAX_SIDE = 4096;

    private GifResizer() {}

    /**
     * {@code crop} (source pixels, clamped to the image) is scaled to fill {@code size}×{@code size};
     * without it the whole image is fitted inside. Returns the GIF unchanged when nothing needs doing.
     */
    static byte[] fitSquare(byte[] gif, int size, Rectangle crop) throws IOException {
        ImageReader reader = ImageIO.getImageReadersByFormatName("gif").next();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("gif").next();
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(gif));
             var bytes = new ByteArrayOutputStream();
             ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            reader.setInput(in, false);
            int frames = reader.getNumImages(true);
            if (frames < 1 || frames > MAX_FRAMES) {
                throw new IOException("GIF com " + frames + " quadros (máx. " + MAX_FRAMES + ").");
            }

            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            Node screen = child(reader.getStreamMetadata().getAsTree(STREAM_FORMAT), "LogicalScreenDescriptor");
            if (screen != null) {
                width = Math.max(width, intAttr(screen, "logicalScreenWidth", width));
                height = Math.max(height, intAttr(screen, "logicalScreenHeight", height));
            }
            if (width > MAX_SIDE || height > MAX_SIDE) {
                throw new IOException("GIF grande demais (máx. " + MAX_SIDE + "px).");
            }
            Rectangle area = crop == null ? new Rectangle(width, height) : crop.intersection(new Rectangle(width, height));
            if (area.isEmpty()) {
                throw new IOException("Área de recorte fora da imagem.");
            }
            boolean whole = area.width == width && area.height == height;
            if (whole && width <= size && height <= size) {
                return gif; // already fits: re-encoding full frames would only make it bigger
            }

            var canvas = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
            writer.setOutput(out);
            writer.prepareWriteSequence(null);

            for (int i = 0; i < frames; i++) {
                BufferedImage frame = reader.read(i);
                Node meta = reader.getImageMetadata(i).getAsTree(IMAGE_FORMAT);
                Node descriptor = child(meta, "ImageDescriptor");
                Node control = child(meta, "GraphicControlExtension");
                int left = descriptor != null ? intAttr(descriptor, "imageLeftPosition", 0) : 0;
                int top = descriptor != null ? intAttr(descriptor, "imageTopPosition", 0) : 0;
                int delay = control != null ? intAttr(control, "delayTime", 10) : 10;
                String disposal = control != null ? attr(control, "disposalMethod") : "none";

                BufferedImage previous = "restoreToPrevious".equals(disposal) ? copy(canvas) : null;
                Graphics2D g = canvas.createGraphics();
                g.drawImage(frame, left, top, null);
                g.dispose();

                BufferedImage scaled = fit(canvas.getSubimage(area.x, area.y, area.width, area.height), size, crop != null);
                writer.writeToSequence(new IIOImage(scaled, null, frameMetadata(writer, scaled, delay, i == 0)), null);

                if ("restoreToBackgroundColor".equals(disposal)) {
                    Graphics2D clear = canvas.createGraphics();
                    clear.setComposite(AlphaComposite.Clear);
                    clear.fillRect(left, top, frame.getWidth(), frame.getHeight());
                    clear.dispose();
                } else if (previous != null) {
                    canvas = previous;
                }
            }
            writer.endWriteSequence();
            out.flush();
            return bytes.toByteArray();
        } finally {
            reader.dispose();
            writer.dispose();
        }
    }

    /**
     * Fits inside {@code size}×{@code size}, centered on a transparent square. A chosen crop fills the
     * square (scaled up if small); a whole image is only ever scaled down.
     */
    private static BufferedImage fit(BufferedImage source, int size, boolean upscale) {
        double scale = Math.min((double) size / source.getWidth(), (double) size / source.getHeight());
        if (!upscale) scale = Math.min(1.0, scale);
        int w = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(source.getHeight() * scale));
        var result = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = result.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(source, (size - w) / 2, (size - h) / 2, w, h, null);
        g.dispose();
        return result;
    }

    /** Full-frame metadata: own delay, cleared before the next frame, looping forever (set on the first). */
    private static IIOMetadata frameMetadata(ImageWriter writer, BufferedImage image, int delay, boolean first)
            throws IOException {
        IIOMetadata metadata = writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(image), null);
        var root = (IIOMetadataNode) metadata.getAsTree(IMAGE_FORMAT);

        var control = new IIOMetadataNode("GraphicControlExtension");
        control.setAttribute("disposalMethod", "restoreToBackgroundColor");
        control.setAttribute("userInputFlag", "FALSE");
        control.setAttribute("transparentColorFlag", "FALSE");
        control.setAttribute("delayTime", Integer.toString(delay));
        control.setAttribute("transparentColorIndex", "0");
        replaceChild(root, control);

        if (first) {
            var extensions = new IIOMetadataNode("ApplicationExtensions");
            var loop = new IIOMetadataNode("ApplicationExtension");
            loop.setAttribute("applicationID", "NETSCAPE");
            loop.setAttribute("authenticationCode", "2.0");
            loop.setUserObject(new byte[] {1, 0, 0}); // loop count 0 = forever
            extensions.appendChild(loop);
            root.appendChild(extensions);
        }
        metadata.setFromTree(IMAGE_FORMAT, root);
        return metadata;
    }

    private static void replaceChild(IIOMetadataNode root, IIOMetadataNode node) {
        Node existing = child(root, node.getNodeName());
        if (existing != null) root.removeChild(existing);
        root.appendChild(node);
    }

    private static BufferedImage copy(BufferedImage image) {
        var copy = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = copy.createGraphics();
        g.drawImage(image, 0, 0, null);
        g.dispose();
        return copy;
    }

    private static Node child(Node parent, String name) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (name.equals(n.getNodeName())) return n;
        }
        return null;
    }

    private static String attr(Node node, String name) {
        Node value = node.getAttributes().getNamedItem(name);
        return value != null ? value.getNodeValue() : null;
    }

    private static int intAttr(Node node, String name, int fallback) {
        try {
            String value = attr(node, name);
            return value != null ? Integer.parseInt(value) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
